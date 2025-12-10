// Comparing arrays of components by reference. This might not be really necessary
// to do, because all operations we officially support modify length of the array
// (add a new component or remove an old one). But if somebody is modifying the
// reactive variable directly we want a sane behavior. The default ReactiveVar
// equality always returns false when comparing any non-primitive values. Because
// the order of components in the children array is arbitrary we could further
// improve this comparison to compare arrays as sets, ignoring the order. Or we
// could have some canonical order of components in the array.
function arrayReferenceEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

function createMatcher(propertyOrMatcherOrFunction) {
  if (_.isString(propertyOrMatcherOrFunction)) {
    const property = propertyOrMatcherOrFunction;
    propertyOrMatcherOrFunction = (child, parent) => {
      return property in child;
    };
  } else if (!_.isFunction(propertyOrMatcherOrFunction)) {
    assert(_.isObject(propertyOrMatcherOrFunction));
    const matcher = propertyOrMatcherOrFunction;
    propertyOrMatcherOrFunction = (child, parent) => {
      for (const property in matcher) {
        if (!Object.prototype.hasOwnProperty.call(matcher, property)) continue;
        const value = matcher[property];
        if (!(property in child)) {
          return false;
        }

        if (_.isFunction(child[property])) {
          if (child[property]() !== value) {
            return false;
          }
        } else {
          if (child[property] !== value) {
            return false;
          }
        }
      }

      return true;
    };
  }

  return propertyOrMatcherOrFunction;
}

class ComponentsNamespace {
  // We have a special field for components. This allows us to have the namespace with the same name
  // as a component, without overriding anything in the component (we do not want to use component
  // object as a namespace object).
  static COMPONENTS_FIELD = '';
}

function getPathAndName(name) {
  assert(name);

  const path = name.split('.');

  name = path.pop();

  assert(name);

  return { path, name };
}

function getNamespace(components, path) {
  assert(_.isObject(components));
  assert(_.isArray(path));

  let match = components;
  let segment;

  while ((segment = path.shift()) != null) {
    match = match[segment];
    if (!_.isObject(match)) {
      return null;
    }
  }

  if (!_.isObject(match)) {
    return null;
  }

  return match || null;
}

function createNamespace(components, path) {
  assert(_.isObject(components));
  assert(_.isArray(path));

  let match = components;
  let segment;

  while ((segment = path.shift()) != null) {
    if (!(segment in match)) {
      match[segment] = new components.constructor();
    }
    match = match[segment];
    assert(_.isObject(match));
  }

  assert(_.isObject(match));

  return match;
}

function getComponent(components, name) {
  assert(_.isObject(components));

  if (!name) {
    return null;
  }

  const { path, name: componentName } = getPathAndName(name);

  const namespace = getNamespace(components, path);
  if (!namespace) {
    return null;
  }

  return namespace[components.constructor.COMPONENTS_FIELD]?.[componentName] || null;
}

function setComponent(components, name, component) {
  assert(_.isObject(components));
  assert(name);
  assert(component);

  const { path, name: componentName } = getPathAndName(name);

  const namespace = createNamespace(components, path);

  if (!namespace[components.constructor.COMPONENTS_FIELD]) {
    namespace[components.constructor.COMPONENTS_FIELD] = new components.constructor();
  }
  assert(!(componentName in namespace[components.constructor.COMPONENTS_FIELD]));
  namespace[components.constructor.COMPONENTS_FIELD][componentName] = component;
}

let componentChildrenDeprecationWarning = false;
let componentChildrenWithDeprecationWarning = false;
let addComponentChildDeprecationWarning = false;
let removeComponentChildDeprecationWarning = false;

let componentParentDeprecationWarning = false;

let childrenComponentsDeprecationWarning = false;
let childrenComponentsWithDeprecationWarning = false;

BaseComponent = class BaseComponent {
  static components = new ComponentsNamespace();

  static register(componentName, componentClass) {
    if (!componentName) {
      throw new Error('Component name is required for registration.');
    }

    // To allow calling @register 'name' from inside a class body.
    if (componentClass == null) {
      componentClass = this;
    }

    if (getComponent(this.components, componentName)) {
      throw new Error(`Component '${componentName}' already registered.`);
    }

    // The last condition is to make sure we do not throw the exception when registering a subclass.
    // Subclassed components have at this stage the same component as the parent component, so we have
    // to check if they are the same class. If not, this is not an error, it is a subclass.
    if (
      componentClass.componentName() &&
      componentClass.componentName() !== componentName &&
      getComponent(this.components, componentClass.componentName()) === componentClass
    ) {
      throw new Error(
        `Component '${componentName}' already registered under the name '${componentClass.componentName()}'.`
      );
    }

    componentClass.componentName(componentName);
    assert.equal(componentClass.componentName(), componentName);

    setComponent(this.components, componentName, componentClass);

    // To allow chaining.
    return this;
  }

  static getComponent(componentsNamespace, componentName) {
    if (!componentName) {
      componentName = componentsNamespace;
      componentsNamespace = this.components;
    }

    // If component is missing, just return a null.
    if (!componentName) {
      return null;
    }

    // But otherwise throw an exception.
    if (!_.isString(componentName)) {
      throw new Error(`Component name '${componentName}' is not a string.`);
    }

    return getComponent(componentsNamespace, componentName);
  }

  // Component name is set in the register class method. If not using a registered component and a component name is
  // wanted, component name has to be set manually or this class method should be overridden with a custom implementation.
  // Care should be taken that unregistered components have their own name and not the name of their parent class, which
  // they would have by default. Probably component name should be set in the constructor for such classes, or by calling
  // componentName class method manually on the new class of this new component.
  static componentName(componentName) {
    // Setter.
    if (componentName) {
      this._componentName = componentName;
      // To allow chaining.
      return this;
    }

    // Getter.
    return this._componentName || null;
  }

  // We allow access to the component name through a method so that it can be accessed in templates in an easy way.
  // It should never be overridden. The implementation should always be exactly the same as class method implementation.
  componentName() {
    // Instance method is just a getter, not a setter as well.
    return this.constructor.componentName();
  }

  // The order of components is arbitrary and does not necessary match siblings relations in DOM.
  // nameOrComponent is optional and it limits the returned children only to those.
  childComponents(nameOrComponent) {
    if (!this._componentInternals) {
      this._componentInternals = {};
    }
    if (!this._componentInternals.childComponents) {
      this._componentInternals.childComponents = new ReactiveField([], arrayReferenceEquals);
    }

    // Quick path. Returns a shallow copy.
    if (!nameOrComponent) {
      return this._componentInternals.childComponents().map((child) => child);
    }

    if (_.isString(nameOrComponent)) {
      return this.childComponentsWith((child, parent) => {
        return child.componentName() === nameOrComponent;
      });
    } else {
      return this.childComponentsWith((child, parent) => {
        // nameOrComponent is a class.
        if (child.constructor === nameOrComponent) {
          return true;
        }

        // nameOrComponent is an instance, or something else.
        if (child === nameOrComponent) {
          return true;
        }

        return false;
      });
    }
  }

  // The order of components is arbitrary and does not necessary match siblings relations in DOM.
  // Returns children which pass a predicate function.
  childComponentsWith(propertyOrMatcherOrFunction) {
    assert(propertyOrMatcherOrFunction);

    propertyOrMatcherOrFunction = createMatcher(propertyOrMatcherOrFunction);

    const results = new ComputedField(
      () => {
        return this.childComponents().filter((child) =>
          propertyOrMatcherOrFunction.call(this, child, this)
        );
      },
      arrayReferenceEquals
    );

    return results();
  }

  addChildComponent(childComponent) {
    if (!this._componentInternals) {
      this._componentInternals = {};
    }
    if (!this._componentInternals.childComponents) {
      this._componentInternals.childComponents = new ReactiveField([], arrayReferenceEquals);
    }
    this._componentInternals.childComponents(
      Tracker.nonreactive(() => {
        return this._componentInternals.childComponents().concat([childComponent]);
      })
    );

    // To allow chaining.
    return this;
  }

  removeChildComponent(childComponent) {
    if (!this._componentInternals) {
      this._componentInternals = {};
    }
    if (!this._componentInternals.childComponents) {
      this._componentInternals.childComponents = new ReactiveField([], arrayReferenceEquals);
    }
    this._componentInternals.childComponents(
      Tracker.nonreactive(() => {
        return _.without(this._componentInternals.childComponents(), childComponent);
      })
    );

    // To allow chaining.
    return this;
  }

  parentComponent(parentComponent) {
    if (!this._componentInternals) {
      this._componentInternals = {};
    }
    // We use reference equality here. This makes reactivity not invalidate the
    // computation if the same component instance (by reference) is set as a parent.
    if (!this._componentInternals.parentComponent) {
      this._componentInternals.parentComponent = new ReactiveField(null, (a, b) => a === b);
    }

    // Setter.
    if (parentComponent !== undefined) {
      this._componentInternals.parentComponent(parentComponent);
      // To allow chaining.
      return this;
    }

    // Getter.
    return this._componentInternals.parentComponent();
  }

  static renderComponent(parentComponent) {
    throw new Error('Not implemented');
  }

  renderComponent(parentComponent) {
    throw new Error('Not implemented');
  }

  static extendComponent(constructor, methods) {
    const currentClass = this;

    if (_.isFunction(constructor)) {
      constructor.prototype = Object.create(currentClass.prototype, {
        constructor: {
          value: constructor,
          writable: true,
          configurable: true,
        },
      });

      Object.setPrototypeOf(constructor, currentClass);
    } else {
      methods = constructor;
      constructor = class extends currentClass {};
    }

    // We expect the plain object of methods here, but if something
    // else is passed, we use only "own" properties.
    for (const property in methods || {}) {
      if (Object.prototype.hasOwnProperty.call(methods, property)) {
        constructor.prototype[property] = methods[property];
      }
    }

    return constructor;
  }

  // Deprecated method names.
  // TODO: Remove them in the future.

  // @deprecated Use childComponents instead.
  componentChildren(...args) {
    if (!componentChildrenDeprecationWarning) {
      componentChildrenDeprecationWarning = true;
      console?.warn('componentChildren has been deprecated. Use childComponents instead.');
    }

    return this.childComponents(...args);
  }

  // @deprecated Use childComponentsWith instead.
  componentChildrenWith(...args) {
    if (!componentChildrenWithDeprecationWarning) {
      componentChildrenWithDeprecationWarning = true;
      console?.warn('componentChildrenWith has been deprecated. Use childComponentsWith instead.');
    }

    return this.childComponentsWith(...args);
  }

  // @deprecated Use addChildComponent instead.
  addComponentChild(...args) {
    if (!addComponentChildDeprecationWarning) {
      addComponentChildDeprecationWarning = true;
      console?.warn('addComponentChild has been deprecated. Use addChildComponent instead.');
    }

    return this.addChildComponent(...args);
  }

  // @deprecated Use removeChildComponent instead.
  removeComponentChild(...args) {
    if (!removeComponentChildDeprecationWarning) {
      removeComponentChildDeprecationWarning = true;
      console?.warn('removeComponentChild has been deprecated. Use removeChildComponent instead.');
    }

    return this.removeChildComponent(...args);
  }

  // @deprecated Use parentComponent instead.
  componentParent(...args) {
    if (!componentParentDeprecationWarning) {
      componentParentDeprecationWarning = true;
      console?.warn('componentParent has been deprecated. Use parentComponent instead.');
    }

    return this.parentComponent(...args);
  }

  // @deprecated Use childComponents instead.
  childrenComponents(...args) {
    if (!componentChildrenDeprecationWarning) {
      componentChildrenDeprecationWarning = true;
      console?.warn('childrenComponents has been deprecated. Use childComponents instead.');
    }

    return this.childComponents(...args);
  }

  // @deprecated Use childComponentsWith instead.
  childrenComponentsWith(...args) {
    if (!componentChildrenWithDeprecationWarning) {
      componentChildrenWithDeprecationWarning = true;
      console?.warn('childrenComponentsWith has been deprecated. Use childComponentsWith instead.');
    }

    return this.childComponentsWith(...args);
  }
};

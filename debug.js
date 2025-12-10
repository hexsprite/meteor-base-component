BaseComponentDebug = class BaseComponentDebug {
  static startComponent(component) {
    const name = component.componentName() || 'unnamed';
    console.group(name);
    console.log('%o', component);
  }

  static endComponent(component) {
    console.groupEnd();
  }

  static startMarkedComponent(component) {
    const name = component.componentName() || 'unnamed';
    console.group('%c%s', 'text-decoration: underline', name);
    console.log('%o', component);
  }

  static endMarkedComponent(component) {
    this.endComponent(component);
  }

  static dumpComponentSubtree(rootComponent, _markComponent = () => {}) {
    if (!rootComponent) {
      return;
    }

    const marked = _markComponent(rootComponent);

    if (marked) {
      this.startMarkedComponent(rootComponent);
    } else {
      this.startComponent(rootComponent);
    }

    for (const child of rootComponent.childComponents()) {
      this.dumpComponentSubtree(child, _markComponent);
    }

    if (marked) {
      this.endMarkedComponent(rootComponent);
    } else {
      this.endComponent(rootComponent);
    }

    return;
  }

  static componentRoot(component) {
    let parentComponent;
    while ((parentComponent = component.parentComponent())) {
      component = parentComponent;
    }

    return component;
  }

  static dumpComponentTree(component) {
    if (!component) {
      return;
    }

    this.dumpComponentSubtree(this.componentRoot(component), (c) => c === component);
  }
};


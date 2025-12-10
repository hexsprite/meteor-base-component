Package.describe({
  name: 'sylido:base-component',
  summary: "Base component for reusable Meteor components",
  version: '0.18.0',
  git: 'https://github.com/sylido/meteor-base-component.git',
  documentation: null
});

Package.onUse(function (api) {
  api.versionsFrom(['2.3', '3.0']);

  // Core dependencies.
  api.use([
    'ecmascript',
    'reactive-var',
    'tracker',
    'underscore'
  ]);

  // 3rd party dependencies.
  api.use([
    'sylido:assert@0.4.0',
    'sylido:reactive-field@0.7.0',
    'sylido:computed-field@0.11.0'
  ]);

  api.export('BaseComponent');
  // TODO: Move to a separate package. Possibly one with debugOnly set to true.
  api.export('BaseComponentDebug');

  api.addFiles([
    'lib.js',
    'debug.js'
  ]);
});

// Tests commented out - were using CoffeeScript
// Package.onTest(function (api) {
//   // Core dependencies.
//   api.use([
//     'ecmascript',
//     'templating',
//     'jquery',
//     'reactive-var',
//     'tracker'
//   ]);
//
//   // Internal dependencies.
//   api.use([
//     'sylido:base-component'
//   ]);
//
//   // 3rd party dependencies.
//   api.use([
//     'peerlibrary:classy-test@0.4.0'
//   ]);
//
//   api.addFiles([
//     'tests.js'
//    ], 'client');
// });

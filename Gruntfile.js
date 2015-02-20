/**
 * Gruntfile for freedom-social-firebase
 *
 * This repository allows Firebase to be used
 * as a freedomjs social provider.
 **/

var path = require('path');
var freedomChromePath = path.dirname(require.resolve(
  'freedom-for-chrome/package.json'));
var freedomFirefoxPath = path.dirname(require.resolve(
  'freedom-for-firefox/package.json'));

module.exports = function(grunt) {
  grunt.initConfig({
    // NOTE - some copy commands are written in order, i.e. depend on previous
    copy: {
      dist: {
        src: ['src/*.js*'],
        dest: 'build/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      firebase: {
        cwd: 'bower_components/firebase/',
        src: ['firebase.js'],
        dest: 'build/',
        flatten: false,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedom: {
        src: [require.resolve('freedom')],
        dest: 'build/demo/webapp/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedomForChrome: {
        cwd: freedomChromePath,
        src: ['freedom-for-chrome.js*'],
        dest: 'build/demo/chrome_extension/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      freedomForFirefox: {
        cwd: freedomFirefoxPath,
        src: ['freedom-for-firefox.jsm'],
        dest: 'build/demo/firefox_addon/data/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      demoMain: {
        cwd: 'src/demo/',
        src: ['**/**'],
        dest: 'build/demo/',
        flatten: false,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      chromeDemo: {
        src: ['build/*.js*', 'build/demo/common/*'],
        dest: 'build/demo/chrome_extension/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      webappDemo: {
        src: ['build/*.js*', 'build/demo/common/*'],
        dest: 'build/demo/webapp/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      },
      firefoxDemo: {
        src: ['build/demo/webapp/*'],
        dest: 'build/demo/firefox_addon/data/',
        flatten: true,
        filter: 'isFile',
        expand: true,
        onlyIf: 'modified'
      }
    },

    jshint: {
      all: ['src/**/*.js'],
      options: {
        jshintrc: true
      }
    },

    connect: {
      demo: {
        options: {
          port: 8000,
          keepalive: true,
          base: ['./', 'build/demo/webapp'],
          open: 'http://localhost:8000/main.html'
        }
      }
    },

    clean: ['build/']
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('build', [
    'jshint',
    'copy'
  ]);
  grunt.registerTask('demo', [
    'build',
    'connect'
  ]);
  grunt.registerTask('default', [
    'build'
  ]);

}
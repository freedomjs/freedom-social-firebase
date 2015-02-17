/* jshint moz:true */

var toggle = require('sdk/ui/button/toggle');
var self = require('sdk/self');
var panels = require('sdk/panel');
const {Cu} = require('chrome');

Cu.import(self.data.url('freedom-for-firefox.jsm'));

var button = toggle.ToggleButton({
  id: "firebase-demo",
  label: "Firebase",
  icon: {
    "16": "./demo-256.png",
    "32": "./demo-256.png",
    "64": "./demo-256.png"
  },
  onChange: handleClick
});

var panel = panels.Panel({
  contentURL: self.data.url('main.html'),
  contentScriptFile: self.data.url('ux.js'),
  onHide: handleHide
});

function handleClick(state) {
  if (state.checked) {
    panel.show({
      position: button
    });
  }
}

function handleHide() {
  button.state('window', {checked: false});
}

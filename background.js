
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('popup.html', {
    'bounds': {
      'width': 900,
      'height': 700
    }
  });
});

var toClientIdEl = document.getElementById('toClientId');
var messageEl = document.getElementById('message');


// Return a Promise that fulfills with token.
function getTokenFromUI() {
  return document.getElementById('oauthToken').value;
}

function appendEvent(text) {
  var newNode = document.createElement('div');
  newNode.innerText = text;
  document.getElementById('events').appendChild(newNode);
}

function dispatchEvent(eventName, data) {
  appendEvent(eventName + ': ' + JSON.stringify(data));
}

var socialProvider;

// TODO: add ability to logout

document.getElementById('loginButton').addEventListener('click', function() {
  var socialNetwork = document.getElementById('socialNetwork').value;
  if (socialNetwork == 'facebook') {
    console.log('creating FacebookSocialProvider');
    socialProvider = new FacebookSocialProvider(dispatchEvent);
  } else if (socialNetwork == 'google') {
    console.log('creating GoogleSocialProvider');
    socialProvider = new GoogleSocialProvider(dispatchEvent);
  } else {
    appendEvent('Unknown social network: ' + socialNetwork);
  }

  var instanceId = document.getElementById('instanceId').value;
  socialProvider.login({agent: instanceId}).then(function() {
    // document.getElementById('loggedInControls')
    //     .style.setProperty('display', 'block');
    // document.getElementById('loginInput')
    //     .style.setProperty('display', 'none');
  }).catch(function(e) {
    console.error('error logging in: ', e);
  });
});

document.getElementById('sendMessageButton')
    .addEventListener('click', function() {
  socialProvider.sendMessage(toClientIdEl.value, messageEl.value);
  messageEl.value = '';
});

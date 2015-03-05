FacebookSocialProvider = function(dispatchEvent) {
  console.log('FacebookSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

FacebookSocialProvider.prototype.getOAuthToken = function() {
  var OAUTH_REDIRECT_URLS = [
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "https://www.uproxy.org/oauth-redirect-uri",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '161927677344933';
  var OAUTH_SCOPE = 'user_friends';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    // TODO: can we force an account chooser so this tab doesn't instantly
    // redirect if they are already logged in?  Or can we try a GET request
    // to see if it gives us a token with no interaction needed?
    var url = "https://www.facebook.com/dialog/oauth?" +
                "client_id=" + encodeURIComponent(OAUTH_CLIENT_ID) +
                "&scope=" + encodeURIComponent(OAUTH_SCOPE) +
                "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
                "&state=" + encodeURIComponent(stateObj.state) +
                "&response_type=token";
    return oauth.launchAuthFlow(url, stateObj);
  }).then(function(responseUrl) {
    return responseUrl.match(/access_token=([^&]+)/)[1];
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

// Returns an array of objects containing name and id.
FacebookSocialProvider.prototype.loadUsers_ = function() {
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?

  if (!this.loginState_) {
    throw 'Not signed in';
  }

  // TODO: use freedom's core.xhr
  var xhr = new XMLHttpRequest();
  var url = 'https://graph.facebook.com/v2.1/me/friends?access_token=' +
      this.loginState_.authData.facebook.accessToken;
  xhr.open('GET', url);
  // TODO: error checking
  var thisSocialProvider = this;
  xhr.onload = function() {
    // TODO: handle paging
    console.log('got friends response: ' + this.response);
    var users = JSON.parse(this.response).data;
    for (var i = 0; i < users.length; ++i) {
      thisSocialProvider.addUserProfile_({
        id: users[i].id,
        name: users[i].name
      });
      thisSocialProvider.getUserImage_(users[i].id);
    }
  };
  xhr.send();
};


FacebookSocialProvider.prototype.getUserImage_ = function(userId) {
  // TODO: refactor into 1 shared get request.
  var xhr = new XMLHttpRequest();
  var url = 'https://graph.facebook.com/v2.1/' + userId + '/picture' +
      '?access_token=' + this.loginState_.authData.facebook.accessToken +
      '&format=json&redirect=false';
  xhr.open('GET', url);
  // TODO: error checking
  var thisSocialProvider = this;
  xhr.onload = function() {
    // TODO: handle paging
    console.log('got user response: ' + this.response);
    var data = JSON.parse(this.response).data;
    thisSocialProvider.updateUserProfile_({id: userId, imageData: data.url});
  };
  xhr.send();
};


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}

GoogleSocialProvider = function(dispatchEvent) {
  console.log('GoogleSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'google';
  this.initState_();
};
GoogleSocialProvider.prototype = new FirebaseSocialProvider();

// TODO: use core.oauth view
GoogleSocialProvider.prototype.getOAuthToken = function() {
  // // Get google token from chrome.identity.launchWebAuthFlow
  // var oauthUrl = "https://accounts.google.com/o/oauth2/auth?" +
  //          "client_id=" + '746567772449-jkm5q5hjqtpq5m9htg9kn0os8qphra4d.apps.googleusercontent.com' +
  //          "&scope=" + 'https://www.googleapis.com/auth/plus.login%20https://www.googleapis.com/auth/plus.me%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile' +
  //          "&redirect_uri=" + chrome.identity.getRedirectURL() +
  //          "&response_type=token";
  // // TODO: why isn't this working?
  // // var url = 'https://accounts.google.com/accountchooser?continue=' +
  // //     encodeURIComponent(oauthUrl);
  // return new Promise(function(fulfill, reject) {
  //   chrome.identity.launchWebAuthFlow({url: oauthUrl, interactive: true},
  //       function(responseUrl) {
  //         var token = responseUrl.match(/access_token=([^&]+)/)[1];
  //         fulfill(token);
  //       });
  // });

  var OAUTH_REDIRECT_URLS = [
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "https://www.uproxy.org/oauth-redirect-uri",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '746567772449-jkm5q5hjqtpq5m9htg9kn0os8qphra4d.apps.googleusercontent.com';
  var OAUTH_SCOPE = 'https://www.googleapis.com/auth/plus.login%20https://www.googleapis.com/auth/plus.me%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    console.log('oauth.initiateOAuth successful');
    var oauthUrl = "https://accounts.google.com/o/oauth2/auth?" +
        "client_id=" + OAUTH_CLIENT_ID +
        "&scope=" + OAUTH_SCOPE +
        "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
        "&state=" + encodeURIComponent(stateObj.state) +
        "&response_type=token";
    var url = 'https://accounts.google.com/accountchooser?continue=' +
        encodeURIComponent(oauthUrl);
    return oauth.launchAuthFlow(url, stateObj);
  }).then(function(responseUrl) {
    console.log('launchAuthFlow succeeded: ' + responseUrl);
    var token = responseUrl.match(/access_token=([^&]+)/)[1];
    console.log('got token: ' + token);
    return token;
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

// Returns an array of objects containing name and id.
GoogleSocialProvider.prototype.loadFriends_ = function() {
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?

  if (!this.loginState_) {
    return Promise.reject('Not signed in');
  }

  return new Promise(function(fulfill, reject) {
    var xhr = new XMLHttpRequest();
    // TODO: is it safe to include the API KEY?
    // TODO: is this the right API to get friends with?
    var url = 'https://www.googleapis.com/plus/v1/people/me/people/visible?key=AIzaSyA1Q7SiEeUdSJwansl2AUFXLpVdnsXUzYg';
    xhr.open('GET', url);
    xhr.setRequestHeader(
        'Authorization',
        'Bearer ' + this.loginState_.authData.google.accessToken);
    xhr.onload = function() {
      // TODO: handle paging?
      // TODO: error checking
      // TODO: this contains an image, use it!!!!
      console.log('got friends response: ' + this.response);
      var responseObj = JSON.parse(this.response);
      var friendsArray = [];  // contains name and id..  TODO: add img, etc
      for (var i = 0; i < responseObj.items.length; ++i) {
        var friend = responseObj.items[i];
        friendsArray.push({id: friend.id, name: friend.displayName});
      }
      fulfill(friendsArray);
    };
    xhr.send();
  }.bind(this));
};


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(GoogleSocialProvider);
  } else {
    freedom.social().providePromises(GoogleSocialProvider);
  }
}


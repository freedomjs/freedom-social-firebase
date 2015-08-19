GoogleSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'google';
  this.initLogger_('GoogleSocialProvider');
  this.initState_();
};
GoogleSocialProvider.prototype = new FirebaseSocialProvider();

/*
 * Returns a Promise which fulfills with an OAuth token.
 */
GoogleSocialProvider.prototype.getOAuthToken_ = function(loginOpts) {
  var OAUTH_REDIRECT_URLS = [
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "https://www.uproxy.org/oauth-redirect-uri",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '746567772449-jkm5q5hjqtpq5m9htg9kn0os8qphra4d' +
      '.apps.googleusercontent.com';
  var OAUTH_SCOPE = 'https://www.googleapis.com/auth/plus.me%20' +
      'https://www.googleapis.com/auth/userinfo.email%20' +
      'https://www.googleapis.com/auth/gmail.send';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
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
    return responseUrl.match(/access_token=([^&]+)/)[1];
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

/*
 * Returns UserProfile object for the logged in user.
 */
GoogleSocialProvider.prototype.getMyUserProfile_ = function() {
  if (!this.loginState_) {
    throw 'Error in GoogleSocialProvider.getMyUserProfile_: not logged in';
  }
  var cachedUserProfile =
      this.loginState_.authData[this.networkName_].cachedUserProfile;
  return {
    userId: this.getUserId_(),
    name: cachedUserProfile.name,
    lastUpdated: Date.now(),
    url: cachedUserProfile.link,
    imageData: cachedUserProfile.picture + '?sz=50'
  };
};

/*
 * Makes get request to Google endpoint, and returns a Promise which
 * fulfills with the response object.
 */
GoogleSocialProvider.prototype.googleGet_ = function(endPoint) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://www.googleapis.com/' + endPoint +
      '?key=AIzaSyA1Q7SiEeUdSJwansl2AUFXLpVdnsXUzYg';
  xhr.open('GET', url);
  xhr.setRequestHeader(
      'Authorization',
      'Bearer ' + this.loginState_.authData.google.accessToken);
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send();
  });
};

/*
 * Makes get request to Google endpoint, and returns a Promise which
 * fulfills with the response object.
 */
GoogleSocialProvider.prototype.googlePost_ = function(endPoint, data) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://www.googleapis.com/' + endPoint +
      '?key=AIzaSyA1Q7SiEeUdSJwansl2AUFXLpVdnsXUzYg&alt=json';
  xhr.open('POST', url);
  xhr.setRequestHeader(
      'Authorization',
      'Bearer ' + this.loginState_.authData.google.accessToken);
  xhr.setRequestHeader(
      'Content-Type', 'application/json');
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send(data);
  });
};

GoogleSocialProvider.prototype.sendEmail = function(friendEmail, subject, body) {
  var email ='"Content-Type: text/plain; charset="us-ascii"\n' +
      'MIME-Version: 1.0\n' +
      'Content-Transfer-Encoding: 7bit\n' +
      'to: ' + friendEmail + '\n' +
      'from: ' + this.email + '\n' +
      'subject: ' + subject + '\n\n' + body;
  this.googlePost_('gmail/v1/users/me/messages/send',
      JSON.stringify({raw: btoa(email)}));
};


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(GoogleSocialProvider);
  } else {
    freedom.social().providePromises(GoogleSocialProvider);
  }
}


FacebookSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initLogger_('FacebookSocialProvider');
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

/*
 * Returns a Promise which fulfills with an OAuth token.
 */
FacebookSocialProvider.prototype.getOAuthToken_ = function(loginOpts) {
  if (loginOpts.interactive) {
    return this.getOAuthTokenInteractive_(loginOpts);
  }

  // For non-interactive logins, attempt to re-use the last accessToken if it
  // is still valid.  If not default to interactive login behavior.
  return this.storage.get('FacebookSocialProvider-last-access-token').then(
      function(lastAccessToken) {
    return this.isValidOAuthToken_(lastAccessToken).then(function(isValid) {
      if (isValid) {
        return lastAccessToken;
      } else {
        return this.getOAuthTokenInteractive_(loginOpts);
      }
    }.bind(this));
  }.bind(this));
};

/*
 * Launches an interactive Facebook OAuth login.
 * Returns a Promise which fulfills with an OAuth token.
 */
FacebookSocialProvider.prototype.getOAuthTokenInteractive_ =
    function(loginOpts) {
  var OAUTH_REDIRECT_URLS = [
    "https://www.uproxy.org/oauth-redirect-uri",
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '161927677344933';
  var OAUTH_SCOPE = 'user_about_me';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    var url = "https://www.facebook.com/dialog/oauth?" +
                "client_id=" + encodeURIComponent(OAUTH_CLIENT_ID) +
                "&scope=" + encodeURIComponent(OAUTH_SCOPE) +
                "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
                "&state=" + encodeURIComponent(stateObj.state) +
                "&response_type=token";
    return oauth.launchAuthFlow(url, stateObj, loginOpts.interactive);
  }).then(function(responseUrl) {
    var accessToken = responseUrl.match(/access_token=([^&]+)/)[1];
    if (loginOpts.rememberLogin) {
      this.storage.set('FacebookSocialProvider-last-access-token', accessToken);
    }
    return accessToken;
  }.bind(this)).catch(function (err) {
    return Promise.reject('Login error: ' + err);
  });
};

/*
 * Returns UserProfile object for the logged in user.
 */
FacebookSocialProvider.prototype.getMyImage_ = function() {
  if (!this.loginState_) {
    throw 'Error in FacebookSocialProvider.getMyImage_: not logged in';
  }
  return this.loginState_.authData[this.networkName_].cachedUserProfile
      .picture.data.url;
};

FacebookSocialProvider.prototype.sendEmail = function(to, subject, body) {
  return Promise.reject('Not implemented');
};

/*
 * Returns a Promise<boolean> that fulfills with true iff token is still valid.
 */
FacebookSocialProvider.prototype.isValidOAuthToken_ = function(token) {
  return new Promise(function(fulfill, reject) {
    if (!token) {
      fulfill(false);
      return;
    }
    var xhr = new XMLHttpRequest();
    var url = 'https://graph.facebook.com/v2.1/me?access_token=' + token +
        '&format=json&redirect=false';
    xhr.open('GET', url);
    xhr.onload = function() {
      if (JSON.parse(this.response).error) {
        fulfill(false);
      } else {
        fulfill(true);
      }
    };
    xhr.send();
  });
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}

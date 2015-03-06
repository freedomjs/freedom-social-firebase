GoogleSocialProvider = function(dispatchEvent) {
  console.log('GoogleSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'google';
  this.initState_();
};
GoogleSocialProvider.prototype = new FirebaseSocialProvider();

GoogleSocialProvider.prototype.getOAuthToken_ = function() {
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

GoogleSocialProvider.prototype.loadUsers_ = function() {
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?
  this.googleGet_('plus/v1/people/me/people/visible').then(function(resp) {
    for (var i = 0; i < resp.items.length; ++i) {
      var friend = resp.items[i];
      this.addUserProfile_({
        id: friend.id,
        name: friend.displayName,
        imageData: friend.image.url,
        url: friend.url
      });
    }
  }.bind(this)).catch(function(e) {
    console.error('Error loading Google users', e);
  });
};


GoogleSocialProvider.prototype.getMyUserProfile_ = function() {
  return this.googleGet_('plus/v1/people/me').then(function(resp) {
    return {
      userId: resp.id,
      name: resp.displayName,
      lastUpdated: Date.now(),
      url: resp.url,
      imageData: resp.image.url
    };
  }.bind(this)).catch(function(e) {
    console.error('Error loading Google users', e);
  });
};


GoogleSocialProvider.prototype.googleGet_ = function(endPoint) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  // TODO: is it safe to include the API KEY?
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


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(GoogleSocialProvider);
  } else {
    freedom.social().providePromises(GoogleSocialProvider);
  }
}


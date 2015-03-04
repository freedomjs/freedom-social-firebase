FacebookSocialProvider = function(dispatchEvent) {
  console.log('FacebookSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

FacebookSocialProvider.prototype.getOAuthToken = function() {
  // TODO: get facebook tokens...
  // Tokens just need user_friends permission
  // var EVA = 'CAACTRbmvZCKUBALKaMZCIGH3VGSefD1VEvfbK4rlyTkqKtZAr7WZAlVpzEx1ZA257ThGQ2v7NulxXRzzJrhvhZA9Eh7JQPRu7lQv8RHGUJM8t0WvP2saLmcaUDdGoeVJHxgr8gw1GinsBkuD1RYSHGsabuRgnseZA3ZBDQU4qKhtv2ZB9r94JWkbl';
  // var DAN = 'CAACTRbmvZCKUBAID6PFGHGkGZCmcrbXRSh491fvIK7CmYRBR92pcqq8UHBpVmTsPQj6gATXeZCEBWZCjjdtZCLe6bmSZBFpGUapg48rQeLbQ0S6dLlvaAwCNPWJYwLQwoZBUyDIoAMd76sxVKCQFwaXqnstXlo1Vhy8CvaUpRmhp9FdL5lASZBn2tjPYqxhXZBm6Y1Wts0TwhVYXMexEOEIWx';
  // return Promise.resolve(EVA);

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
    console.log('oauth.initiateOAuth successful');
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
    console.log('launchAuthFlow succeeded: ' + responseUrl);
    var token = responseUrl.match(/access_token=([^&]+)/)[1];
    console.log('got token: ' + token);
    return token;
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

// Returns an array of objects containing name and id.
FacebookSocialProvider.prototype.loadFriends_ = function() {
  console.log('in loadFriends_');
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?

  if (!this.loginState_) {
    return Promise.reject('Not signed in');
  }

  // TODO: use freedom's core.xhr
  return new Promise(function(fulfill, reject) {
    var xhr = new XMLHttpRequest();
    var url = 'https://graph.facebook.com/v2.1/me/friends?access_token=' +
        this.loginState_.authData.facebook.accessToken;
    xhr.open('GET', url);
    // TODO: error checking
    xhr.onload = function() {
      // TODO: handle paging
      console.log('got friends response: ' + this.response);
      fulfill(JSON.parse(this.response).data);
    };
    xhr.send();
  }.bind(this));
};


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}

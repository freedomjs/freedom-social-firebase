FacebookSocialProvider = function(dispatchEvent) {
  console.log('FacebookSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initState_();
};
// TODO: this seems weird
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

FacebookSocialProvider.prototype.getOAuthToken = function() {
  // TODO: get facebook tokens...
  // Tokens just need user_friends permission
  var EVA = 'CAACTRbmvZCKUBALKaMZCIGH3VGSefD1VEvfbK4rlyTkqKtZAr7WZAlVpzEx1ZA257ThGQ2v7NulxXRzzJrhvhZA9Eh7JQPRu7lQv8RHGUJM8t0WvP2saLmcaUDdGoeVJHxgr8gw1GinsBkuD1RYSHGsabuRgnseZA3ZBDQU4qKhtv2ZB9r94JWkbl';
  var DAN = 'CAACTRbmvZCKUBAID6PFGHGkGZCmcrbXRSh491fvIK7CmYRBR92pcqq8UHBpVmTsPQj6gATXeZCEBWZCjjdtZCLe6bmSZBFpGUapg48rQeLbQ0S6dLlvaAwCNPWJYwLQwoZBUyDIoAMd76sxVKCQFwaXqnstXlo1Vhy8CvaUpRmhp9FdL5lASZBn2tjPYqxhXZBm6Y1Wts0TwhVYXMexEOEIWx';
  return Promise.resolve(EVA);
};

// Returns an array of objects containing name and id.
FacebookSocialProvider.prototype.loadFriends_ = function() {
  console.log('in loadFriends_');
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?

  if (!this.loginState_) {
    return Promise.reject('Not signed in');
  }

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
}


// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}

// Set window.
if (typeof global !== 'undefined') {
  if (typeof window === 'undefined') {
    global.window = {};
  }
} else {
  if (typeof window === 'undefined') {
    var window = {};
  }
}

// Set document.
if (typeof global !== 'undefined') {
  if (typeof document === 'undefined') {
    global.document = {};
  }
} else {
  if (typeof document === 'undefined') {
    var document = {};
  }
}

if (XMLHttpRequest && !window.XMLHttpRequest) {
  window.XMLHttpRequest = XMLHttpRequest;
}

// WebSocket shim, currently needed for Firefox workers to use sockets
if (typeof WebSocket === 'undefined') {
  console.log('shimming WebSocket');
  WebSocket = function(url, protocols) {
    var ws = new freedom['core.websocket'](url, protocols);
    console.log(ws);
    this.send = function(payload) {
      ws.send({text:payload});
    };
    this.close = ws.close;
    ws.on('onOpen', function() {
      if (typeof this.onopen !== 'undefined') {
        this.onopen();
      }
    }.bind(this));
    ws.on('onClose', function() {
      if (typeof this.onclose !== 'undefined') {
        this.onclose();
      }
    }.bind(this));
    ws.on('onMessage', function(m) {
      if (typeof this.onmessage !== 'undefined') {
        m.data = m.text;  // Firebase expects .data field
        this.onmessage(m);
      }
    }.bind(this));
    ws.on('onError', function(e) {
      if (typeof this.onerror !== 'undefined') {
        this.onerror(e);
      }
    }.bind(this));
  };
}
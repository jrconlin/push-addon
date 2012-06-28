const main = require('main'),
      observer = require('observer'),
      fnc = require('fncrypto'),
      tabs = require('tabs');

var dumpObj = function(obj,name){
  if (! name) {
    name = typeof(obj);
  }
  switch (typeof(obj)) {
    case 'object':
      keys = Object.keys(obj);
      console.info('=== dumping', name);
      for(var i=0;i<keys.length;i++){
        console.info(' ',keys[i],
          typeof(obj[keys[i]])=='function' ? '()' : JSON.stringify(obj[keys[i]]))
      }
      console.info('===');
      break;
    case 'string':
    case 'number':
      console.info(obj);
      break;
    default:
      console.info(typeof(obj))
  }
}

exports.ui = function() {
  let data = require('self').data;

  let panel = require('panel').Panel({
    contentURL: data.url('panel.html'),
    contentScriptFile: [data.url('prettyTime.js'),
                        data.url('mustache.js'),
                        data.url('panel.js')],
    width: 420,
    height: 400,
    onHide: function() { observer.emit('panel:hide'); }
  });


  panel.port.on('kill', function(site) {
    url=main.DB['queue:' + site];
    dumpObj(main.DB, 'DB');
    console.debug("ui recv'd kill for ", site, url );
    if (url) {
    main.xhr({'dryrun':true,
             'method': 'DELETE',
             'url': url,
             'cb': function(a){}});
    }
  });

  panel.port.on('pause', function(site) {
    console.debug("ui recv'd pause for ", site);
  })

  let widget = require('widget').Widget({
    id: 'notifications',
    label: 'Notification Center',
    width: 20,
    contentURL: data.url('widget.html'),
    contentScriptFile: data.url('widget.js'),
    panel: panel
  });

  panel.port.on('click', function(url, bg) {
    if (url) {
      tabs.open({
        url: url,
        inBackground: bg
      });
    }
  });

  panel.port.on('delete', function(index) {
    panel.port.emit('delete', index);
    main.DB.messages.splice(index, 1);
  });

  panel.port.on('clear-all', function() {
    main.DB.messages = [];
  });

  observer.on('message:init', function(e) {
    dumpObj(e.data, 'observer->message:init.e')
    let data = {'notifications': e.data.messages,
      'sites': main.DB.sites,
      'DB': main.DB,
      'origin': 'observer'
    };
    dumpObj(data, 'observer->message:init.data');
    panel.port.emit('message:init', data);
  });

  observer.on('message', function(e) {
    dumpObj(e.data, 'observer:message.data');
    // start the translated message.
    let msg = {
        time: e.data.timestamp * 1000
    }
    // Decrypt the message.
    let useDefaultBits = true;
    let msgElements = ['title', 'body', 'actionUrl'];
    if (e.data.body.hasOwnProperty('cryptoBlock')) {
        try {
            decrypt = fnc.decrypt(e.data.body.cryptoBlock,
                e.data.queue);
            msgElements.forEach(function(field) {
               if (decrypt.json.hasOwnProperty(field)){
                  msg[field] = decrypt.json[field];
               }
               msg['encrypted'] = true;
            })
            useDefaultBits = false;
        } catch (e) {
            console.error('Error decrypting:', e);
        }
    }
    if (useDefaultBits) {
        msgElements.forEach(function(field) {
            if (e.data.body.hasOwnProperty(field)) {
                msg[field] = e.data.body[field];
            }
        });
    }
    // preserve the site.
    msg['token'] = e.data['token'];
    msg['site'] = main.DB['domain:' + e.data['token']];
    // Add the message to the internal list of messages.
    console.debug("Adding message to the list of messages", main.DB.messages.length );
    main.DB.messages.push(msg);
    // Sending message to panel.
    dumpObj(main.DB, 'setDB ');
    panel.port.emit('setDB', main.DB);
    panel.port.emit('message', msg);
  });
  observer.on('count', function(e) {
    widget.port.emit('count', e.data);
  });
};

exports.model = function() {

  let messages = main.DB.messages || (main.DB.messages = []),
      count = 'count' in main.DB ? main.DB.count : messages.length;

  console.debug('initializing model messages');
  // init the model to the observers
  observer.emit('message:init', {'origin': 'ui',
                'messages':messages
                });
  // set the counter.
  observer.emit('count', count);

  observer.on('message', function(e) {
    console.debug('observer incrementing count');
    observer.emit('count', ++count);
  });

  observer.on('panel:hide', function() {
    count = 0;
    observer.emit('count', count);
  });

  observer.on('count', function(e) {
    main.DB.count = e.data;
  });

};

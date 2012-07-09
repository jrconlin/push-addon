const main = require('main'),
      observer = require('observer'),
      fnc = require('fncrypto'),
      tabs = require('tabs');
      DB = require('simple-storage').storage;

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


  panel.port.on('kill', function(siteInfo) {
    console.debug('kill', JSON.stringify(siteInfo));
    url=DB['queue:' + siteInfo.queue];
    url += "?token=" + DB['token'];
    console.debug("ui recv'd kill for ", siteInfo.queue, url );
    if (url) {
      main.xhr({
             'method': 'DELETE',
             'url': url,
             'error': function(reply) {
                console.error(JSON.stringify(reply));
             },
             'success': function(reply){
                console.info('Delete returned', JSON.stringify(reply.responseText));
                // and tidy up the DB.
                if (!reply) {
                  console.error("No reply returned");
                }
                try {
                  reply = JSON.parse(reply.responseText);
                  if (!reply.token) {
                    console.error("Could not find token", JSON.stringify(reply));
                    return;
                  }
                }
                catch (e) {
                  console.error("Exception parsing reply", e);
                  return;
                }
                siteId = reply.queue.split('/')[4];
                site = DB['domain:' + siteId];
                console.info('burning site ', site);
                siteInfo = DB.sites[site];
                if (siteInfo) {
                  delete(DB['queue:' + siteInfo.name]);
                  delete(DB['domain:' + siteInfo.token]);
                  if (siteInfo.kb) {
                    fnc.remove(siteInfo.kb);
                  }
                  // kill off the messages from this site.
                  for (i=DB.messages.length; i>0; i--){
                    if (DB.messages[i-1].site == siteInfo.name){
                      DB.messages.splice(i-1, 1);
                      // since panel has it's own copy of the notifications
                      //TODO: need to figure out how to remove that.
                      panel.port.emit('delete', i-1);
                    }
                  }
                  delete(DB.sites[site]);
                }
                dumpObj(DB, 'purged DB...');
                console.info('refreshing...')
                panel.port.emit('setDB',DB);
                panel.port.emit('refresh');
              }
            });
    }
  });

  panel.port.on('pause', function(siteInfo) {
    console.debug("ui recv'd pause for ", JSON.stringify(siteInfo));
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
    DB.messages.splice(index, 1);
  });

  panel.port.on('clear-all', function() {
    DB.messages = [];
  });

  observer.on('message:init', function(e) {
    dumpObj(e.data, 'observer->message:init.e')
    let data = {'notifications': e.data.messages,
      'sites': DB.sites,
      'DB': DB,
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
    msg['site'] = DB['domain:' + e.data['token']];
    // Add the message to the internal list of messages.
    console.debug("Adding message to the list of messages", DB.messages.length );
    DB.messages.push(msg);
    // Sending message to panel.
    dumpObj(DB, 'setDB ');
    panel.port.emit('setDB', DB);
    panel.port.emit('message', msg);
  });
  observer.on('count', function(e) {
    widget.port.emit('count', e.data);
  });
};

exports.model = function() {

  let messages = DB.messages || (DB.messages = []),
      count = 'count' in DB ? DB.count : messages.length;

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
    DB.count = e.data;
  });

};

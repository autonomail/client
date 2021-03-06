/**
 * GPG service
 *
 * This internally delegates calls to the GnuPG2 worker thread. 
 * 
 * Incorporates code from:
 *    https://github.com/manuels/unix-toolbox.js-base/blob/master/interface.js
 *    https://github.com/manuels/unix-toolbox.js-gnupg/blob/master/demo.js
 */
'use strict';

(function(app) {

  app.factory('GPGError', function(RuntimeError) {
    return RuntimeError.define('GPGError');
  });


  app.provider('GPG', function() {

    var workerScriptUrl = null;

    return {
      setWorkerScript: function(scriptUrl) {
        workerScriptUrl = scriptUrl;
      },


      $get: function(Log, $q, GPGError, GPGWorker, GPGUtils, Random) {
        var log = Log.create('GPG');
        
        return new (Class.extend({

          init: function() {
            var self = this;

            // the virtual fs to setup the worker with
            self.virtualFs = {
              // make sure better hash algo's are prioritized (see https://we.riseup.net/riseuplabs+paow/openpgp-best-practices)
              '/home/emscripten/.gnupg/gpg.conf':  [
                'keyid-format 0xlong',
                'personal-digest-preferences SHA512 SHA384 SHA256 SHA224',
                'verify-options show-uid-validity',
                'list-options show-uid-validity',
                'default-preference-list SHA512 SHA384 SHA256 SHA224 AES256 AES192 AES CAST5 ZLIB ZIP Uncompressed',
                'sig-notation issuer-fpr@notations.openpgp.fifthhorseman.net=%g',
                'cert-digest-algo SHA512'
              ].join("\n"),
              // we need to create these files to ensure our getFiles() always succeed
              '/home/emscripten/.gnupg/pubring.gpg': '',
              '/home/emscripten/.gnupg/secring.gpg': ''
            };

            // from https://github.com/manuels/unix-toolbox.js-gnupg/blob/master/demo/trustdb.gpg
            // self.virtualFs['/home/emscripten/.gnupg/pubring.gpg'] = atob("mQENBFGPt4UBCADDlU9Jc8mY/W1bzXPkuaybtHwYU3NYdyDMQS/1vkT1lLGJG7HtZQVyokFRi6BrWg6Yv49rtaasoEOqBLUkQyltLkCkd3o0aqlGPua4u8sn6TAH9sNKo6K5xeHXMW54RkcxedNKyqherf0yLwwf513iF27YBroH6fay7cExO3GVSuFeW8x2glCUu2kp0npZlbjOKJHjgIQ1l3sFYKC5OPPQQpA5/gsW4uiPSRxK0laNCeMiZu4JQOZYpD0gwbo4Px46APzdk3W3u0Ju1U/TFa4BQhR+1Ii/lQm+03B3oKfDFFMPBG2WBlv48n17WP23jXwhBPF6Bo7ENUiXFCGttnBJABEBAAG0K0FsaWNlIChQYXNzcGhyYXNlIGlzIGFsaWNlKSA8YWxpY2VAZm9vLmNvbT6JATgEEwECACIFAlGPt4UCGwMGCwkIBwMCBhUIAgkKCwQWAgMBAh4BAheAAAoJEJ5LR3SYmgqHvgcH/0aIlaBeAtIhxx7/ams3YaO4VcYah5nkt0W5swq67l3bT6QnvRvFHaAMPKpXFSbb7oCbNl+CIUMxBSumz35cLhJVwSUMeOq3+Rp2MSqD6MG23TqZ55cqRGKw/PG68RCDMPVc962cnn97429p7c+8mhIemlOcAR9IXLYHpo0BqDEhZ+UJrU/E56iDs6ZfgWWgzXirZfoO25lIyeQlqnOjaANnlC+jvw230PBhf0ZcCtKe8GBXhGAD+mkzkOYRGP8XpkK9/kdndHZcmUEYB54YlDk4BVj8KU2zLGgLTggTF+I8A0YrH57/k/gA0Lv7rmjllUEMtzqWyaKrfytyz6Szb72wAgADuQENBFGPt4UBCADS36JCAbQyo49Gv8RicKACgUXoNjYWTsOXsjzkga8xMRJaoOAFJFgSH20LeFlJncqH301Os6nMXM9/wAFoa2PiwpLwdBhIJeQR5UL0DECUFBAcUYyq8k5/8mKunkOaWTFWEA8YQeXRmSoE1modVUZK8Zd89mU3XEPHurC0yZalBDDG0L9ZmkOTvJMzxYJJrej6ZMuPCfUXFy1keq9Nyd6WgRzU8a/MMtC1cZcXab0LzIPsITxSM+CqYxHDhp5IHcH+k4FvcRsRPEJXoe0ywdbwXmlrzPIoZrbl63K4N1Cp3/eeyxdJlPn/nXQXQ/1xSDNyXGSprPo1gaz+XZX6zOVjABEBAAGJAR8EGAECAAkFAlGPt4UCGwwACgkQnktHdJiaCoeGnwgAwvSDiCsJzna3HBrpNuCza5x0mI9hcM/veHzsslOoqOHDzgBBiZE8yYcuwWOwARD810E9Eb1T2tZbNM3heOkjVWqq0rQAbNIqCUAAkQSPyIbEYdPMqiqWDB7nkTKcEzoALVf4PuzIgBUWYMS42vmcoDhQho//lMAZZL2kIFBySjXjMd324EGatcOjNPm8OBT96OIlU6BqXBObEZpEFcpT3SxUGlEE8nU76b2rlmxxAh6UYXT9LytbuXtr2XS6b9Y49fKyC96ROHQM4s3H10ZY39SjZZz0l0oibKPLF7C4Mb6dcP1CE9SYt1Kij2Kt5q/V0VisxpoO7V/KPC7xBdkaQrACAAM=")
            // self.virtualFs['/home/emscripten/.gnupg/secring.gpg'] = atob("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")
            // self.virtualFs['/home/emscripten/.gnupg/trustdb.gpg'] = atob("AWdwZwMDAQUBAgAAUY+4KwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAs4zAqpwKS/sRdPLqeS0d0mJoKhwYAAAAAAAAfAAAAAAAAAAAAAA0ALN5X1qGlQzhDDw8aVqW/lHOzKQMGAAAAAAAAAAAAAAAAAAAAAAA=")

            // locks
            self._locks = {};

            self._createWorker = _.bind(self._createWorker, self);
            self._lock = _.bind(self._lock, self);
            self._unlock = _.bind(self._unlock, self);

            // to cache execution results
            self._cache = {};
          },


          /**
           * Fill the EGD pool with entropy.
           *
           * This will ensure that `/dev/egd-pool` in the virtual filesystem contains enough random data. 
           * This should be called prior to worker creation.
           *
           * @return {Promise}
           */
          _ensureEntropy: function() {
            var self = this;

            var defer = $q.defer();

            $q.when()
              .then(function() {
                if (self._randomData) {
                  return self._randomData;
                } else {
                  return Random.getRandomBytes(65536)
                    .then(function fillEGDPool(words) {
                      self._randomData = sjcl.codec.utf8String.fromBitsRaw(words);
                      
                      log.debug('Adding ' + self._randomData.length + 
                        ' bytes to EGD pool...');

                      return self._randomData;
                    });
                }
              })
              .then(function(randomData) {
                self.virtualFs['/dev/egd-pool'] = randomData;
              })
              .then(defer.resolve)
              .catch(defer.reject)
            ;

            return defer.promise;
          },



          /**
           * Create a GPG worker.
           *
           * This will instantiate a new `GPGWorker` and load in the current virtual filesystem contents.
           *
           * @return {Promise} resolves to `GPGWorker` instance.
           */
          _createWorker: function() {
            var self = this;

            var worker = null;

            return self._ensureEntropy()            
              .then(function createWorker() {
                worker = new GPGWorker(workerScriptUrl, log);
              })
              .then(function setupFS() {
                worker.mkdir('/home');
                worker.mkdir('/home/emscripten');
                worker.mkdir('/home/emscripten/.gnupg');
                return worker.waitUntilReady();
              })
              .then(function loadVirtualFileSystem() {
                for (var f in self.virtualFs) {
                  worker.addData(self.virtualFs[f], f);
                }
                return worker.waitUntilReady();
              })
              .then(function done() {
                return worker;
              })
            ;
          },





          /**
           * Destroy a GPG worker.
           *
           * This will save the worker's virtual filesystem.
           *
           * @return {Promise}
           */
          _destroyWorker: function(worker) {
            var self = this;

            var defer = $q.defer();

            worker.getFiles(
              '/home/emscripten/.gnupg/pubring.gpg',
              '/home/emscripten/.gnupg/secring.gpg',
              '/home/emscripten/.gnupg/trustdb.gpg'
            )
              .then(function saveFileData(fileData) {
                log.debug('Saved virtual fs state');

                self.virtualFs = fileData;
              })
              .then(defer.resolve)
              .catch(function(err) {
                log.error('Error fetching files form virtual FS', err);
                defer.reject(err);
              })
            ;

            return defer.promise;
          },



          /**
           * Request a mutex lock.
           *
           * This returned function will return any incoming arguments pass 
           * out, allowing for this method to be used within a Promise chain.
           * 
           * @param {name} String Name of lock to return.
           * 
           * @return {Function} Function which returns a Promise.
           */
          _lock: function(name) {
            var self = this;

            self._locks[name] = self._locks[name] || [];

            return function() {
              var defer = $q.defer();

              /* 
              Set up resolving function.

              This will set the internal `__isResolved` flag and also ensure 
              all incoming arguments get passed through to the next Promise 
              function.
              */
              defer.resolveWithArgs = (function(me, args) {
                return function() {
                  me.resolve.apply(me, args);
                  me.__isResolved = true; // gets checked in _unlock()
                }
              })(defer, arguments);

              // add to queue
              self._locks[name].push(defer);

              // there is only 1 item in queue then resolve immediately
              if (1 === self._locks[name].length) {
                defer.resolveWithArgs();
              }

              return defer.promise;
            }
          },



          /**
           * Release a mutex lock.
           *
           * This will hand the lock over to the next mutext request in the 
           * given queue.
           *
           * This returned function will return any incoming arguments pass 
           * out, allowing for this method to be used within a Promise chain.
           * 
           * @param {name} String Name of lock to return.
           * 
           * @return {Function} Function which returns a Promise.
           */
          _unlock: function(name) {
            var self = this;

            if (!self._locks[name]) {
              throw new Error('_lock() must be called first for ' + name);
            }

            return function() {
              // top item must be the lock corresponding to this unlock call
              var topItem = self._locks[name].shift();

              if (!topItem.__isResolved) {
                throw new Error('_lock() must be called first for ' + name);
              }              

              // resolve next queue item
              if (0 < self._locks[name].length) {
                self._locks[name][0].resolveWithArgs();
              }

              var defer = $q.defer();

              defer.resolve.apply(defer, arguments);

              return defer.promise;
            }
          },




          /**
           * Execute a GPG command.
           *
           * This automatically loads the virtual filesystem prior to executing the command, and then saves it afterwards. It also 
           * make sure that only one GPG command execute at a time (even if multiple calls are made to this function in parallel).
           * 
           * @param  {Object} [inputFiles] List of files to setup in the virtual filesystem prior to making the call. 
           * These are specified as {path: Promise} where the `Promise` evaluates to the file contents.
           * 
           * @param  {Array} [gpgCommand] Parameters to pass to the GPG command-line. The parameters are parsed to check for the 
           * `--output` parameter. If found then the named output file is automatically fetched and returned in the results once 
           * the command has successfully executed.
           * 
           * @return {Promise} Resolves to an `Object` consisting of the `stdout` and output file (if any) specified in the input 
           * parameters.
           */
          _execute: function(inputFiles, gpgCommand) {
            var self = this;

            inputFiles = inputFiles || {};
            gpgCommand = gpgCommand || [];

            var defer = $q.defer();

            var outputFilePath;
            var worker = null;
            var results = {
              stdout: []
            };

            self._lock('exec')()
              .then(function checkForOutputFileParam() {
                var outputParamIndex = gpgCommand.indexOf('--output');

                if (0 <= outputParamIndex) {
                  if (gpgCommand.length - 1 <= outputParamIndex) {
                    throw new Error('Output file name must be specified if using --output');
                  }
                  outputFilePath = gpgCommand[outputParamIndex + 1]
                }
              })
              .then(function getInputFiles() {
                return $q.all(inputFiles);
              })
              .then(function writeInputFiles(_resolvedInputFiles) {
                _.each(_resolvedInputFiles || {}, function(contents, path) {
                  self.virtualFs[path] = contents;
                })
              })
              .then(self._createWorker)
              .then(function executeCommand(newWorker) {
                worker = newWorker;

                if (0 < gpgCommand.length) {
                  return worker.run.apply(worker, gpgCommand)
                    .then(function saveStdout(stdout) {
                      if (stdout) {
                        results.stdout = stdout;                                              
                      }
                    });
                }
              })
              .then(function fetchOutputFile(){
                if (outputFilePath) {
                  return worker.getFile(outputFilePath)
                    .then(function(contents) {
                      results[outputFilePath] = contents;
                    });
                }
              })
              .then(function killWorker() {
                return self._destroyWorker(worker);
              })
              .then(function returnResults(){
                self._unlock('exec')();
                defer.resolve(results);
              })
              .catch(function(err) {
                self._unlock('exec')();
                defer.reject(err);
              })
            ;

            return defer.promise;
          },




          /**
           * Generate a new key-pair
           * 
           * References: 
           *  - https://alexcabal.com/creating-the-perfect-gpg-keypair/
           *  
           * @param emailAddress {string} user id.
           * @param passphrase {string} user passphrase.
           * @param keyStrength {Integer} key strength in bit size (only 2048 or 4096 are accepted).
           */
          generateKeyPair: function(emailAddress, passphrase, keyStrength) {
            var self = this;

            log.debug('Generating ' + keyStrength + '-bit keypair for '  + 
                emailAddress + ' with passphrase ' + passphrase);

            self._clearCaches('keys');

            var startTime = moment();

            return $q.when(function() {
              if (2048 >= keyStrength) {
                throw new GPGError('GPG key bit length must be >= 2048');
              }              
            })
              .then(function genKey() {
                var inputFiles = {
                  '/input.txt': $q.when([
                      'Key-Type: RSA',
                      'Key-Length: ' + keyStrength,
                      'Key-Usage: sign',
                      'Subkey-Type: RSA',
                      'Subkey-Length: ' + keyStrength,
                      'Subkey-Usage: encrypt',
                      'Name-Email: ' + emailAddress,
                      'Expire-Date: 5y',
                      'Passphrase: ' + passphrase,
                      '%commit'
                    ].join("\n")
                  )
                };

                return self._execute(inputFiles, ['--gen-key', '/input.txt']);
              })
              .then(function(results) {
                log.debug('Time taken: ' + moment().diff(startTime, 'seconds') + ' seconds');
                
                return results.stdout;                
              })
            ;
          }, // generateKeyPair()



          /**
           * Get all keys in the user's keychain.
           *
           * @return {Array}
           */
          getAllKeys: function() {
            var self = this;

            log.debug('Getting all keys stored in keychain');

            return self._lock('getAllKeys')()
              .then(function checkCache() {
                if (!self._getCache('keys')) {
                  return self._execute({}, 
                      ['--list-keys', '--with-colons', '--fixed-list-mode'])
                    .then(function getOutput(results) {
                      self._setCache('keys', 
                        GPGUtils.parseKeyList(results.stdout));
                    });
                } else {
                  log.debug('...fetch from cache');
                }
              })
              .then(function done() {
                return self._getCache('keys');
              })
              .then(self._unlock('getAllKeys'))
            ;
          }, // getAllKeys()




          /**
           * Encrypt message to given recipients.
           *
           * It assumes that public keys are available for all recipients and 
           * will sign the message in addition to encrypting it.
           * 
           * @param {String} from Sender id/email.
           * @param {String} passphrase Sender key passphrase.
           * @param {String} msg Message to send.
           * @param {String} ... Recipient id/email as each argument.
           *
           * @return {Promise} Resolves to PGP message string.
           */
          encrypt: function(from, passphrase, msg) {
            var self = this;

            var recipients = _.rest(arguments, 3);

            log.debug('Encrypting message of ' + msg.length + 
              ' characters for ' + recipients.length);

            return self._execute({
              '/msg.txt': $q.when(msg)
            }, 
              _.chain(recipients)
                .map(function(r) {
                  return ['--recipient', r];
                })
                .flatten()
                .value()
              .concat(
                [  
                  '--default-key', from, 
                  '--passphrase', self._sanitizePassphrase(passphrase),
                  '--armor', 
                  '--output', '/msg.enc',
                  '--detach-sign',
                  '--encrypt',
                  '--encrypt-to', from, // so that sender can read it
                  '/msg.txt'
                ]
              )
            )
              .then(function getOutput(results) {
                var txt = results['/msg.enc'];

                log.debug('PGP msg: ', txt);

                return txt;
              })
            ;

          }, // encrypt()




          /**
           * Decrypt message.
           *
           * It assumes that public keys are available for the sender.
           * 
           * @param {String} msg Message.
           *
           * @return {Promise} Resolves to plaintxt message string.
           */
          decrypt: function(msg) {
            var self = this;

            log.debug('Decrypting message of ' + msg.length);

            return self._execute({
              '/msg.txt.asc': $q.when(msg)
            }, 
              [  
                '--output', '/msg.txt',
                '/msg.txt.asc'
              ]
            )
              .then(function getOutput(results) {
                return results['/msg.txt'];
              });

          }, // decrypt()






          /**
           * Sign message.
           *
           * @param {String} from Sender id/email.
           * @param {String} passphrase Sender key passphrase.
           * @param {String} msg Message to send.
           *
           * @return {Promise} Resolves to PGP signature string.
           */
          sign: function(from, passphrase, msg) {
            var self = this;

            log.debug('Signing message of ' + msg.length + ' characters');

            return self._execute({
              '/msg.txt': $q.when(msg)
            }, [  
                  '--default-key', from, 
                  '--passphrase', self._sanitizePassphrase(passphrase),
                  '--armor', 
                  '--output', '/msg.sig',
                  '--detach-sign',
                  '/msg.txt'
              ]
            )
              .then(function getOutput(results) {
                var txt = results['/msg.sig'];

                log.debug('PGP sig: ', txt);

                return txt;
              });
            ;

          }, // sign()




          /**
           * Verify signature of a signed message.
           *
           * @param {String} msg Message.
           * @param {String} sig Signature to verify.
           *
           * @return {Promise} Resolves to true if good signature; false otherwise.
           */
          verify: function(msg, sig) {
            var self = this;

            log.debug('Verify signature for message of ' + msg.length + ' characters');

            return self._execute({
              '/msg.txt': $q.when(msg),
              '/msg.txt.gpg': $q.when(sig)
            }, [  
                  '--verify', 
                  '/msg.txt.gpg',
                  '/msg.txt'
              ]
            )
              .then(function getOutput(results) {
                return GPGUtils.isGoodSignature(results.stdout);
              });
            ;

          }, // verify()




          /**
           * Import a key into the user's keychain.
           *
           * @param {String} key The exported key in ASCII armour format.
           */
          importKey: function(key) {
            var self = this;

            log.debug('Importing key into keychain');

            self._clearCaches('keys');

            var inputFiles = {
              '/import.gpg': $q.when(key)
            };

            return self._execute(inputFiles, ['--import', '/import.gpg']);
          }, // importKey()





          /**
           * Backup all GPG data.
           *
           * @return {Promise} resolves to Object containg backup data
           */
          backup: function() {
            var self = this;

            return $q.when({
              'pubring.gpg': self.virtualFs['/home/emscripten/.gnupg/pubring.gpg'],
              'secring.gpg': self.virtualFs['/home/emscripten/.gnupg/secring.gpg'],
              'trustdb.gpg': self.virtualFs['/home/emscripten/.gnupg/trustdb.gpg']              
            });
          },




          /**
           * Restore all GPG data from a backup.
           *
           * @param data {Object} data previously obtained by calling backup().
           *
           * @return {Promise}
           */
          restore: function(data) {
            var self = this;

            log.debug('Restore virtual filesystem to given state');

            for (var f in data) {
              self.virtualFs['/home/emscripten/.gnupg/' + f] = data[f];
            }

            return $q.when(true);
          },


          /**
           * Get cached data.
           * @param  {String} key Key.
           * @return {*} data.
           */
          _getCache: function(key) {
            return this._cache[key];
          },


          /**
           * Set cached data.
           * @param  {String} key Key.
           * @param {*} data Value
           */
          _setCache: function(key, data) {
            return this._cache[key] = data;
          },


          /**
           * Clear cached data.
           * @param  {String} key1 Name of first cache to clear. Subsequent arguments name other cache keys.
           */
          _clearCaches: function(key1) {
            var self = this;

            _.each(arguments, function(key) {
              delete self._cache[key];
            });
          },


          /**
           * Sanitize a passphrase for use in GPG command-line call.
           * 
           * @param  {String} passphrase The pass phrase.
           * @return {String}
           */
          _sanitizePassphrase: function(passphrase) {
            return passphrase.trim();
          }

        }));
      }
    };
  });



  /**
   * GPG worker object which calls through to the worker thread.
   */
  app.factory('GPGWorker', function(Log, $q, GPGError) {

    return Class.extend({

      init: function(workerScriptUrl, log) {
        var self = this;

        self.log = (log || Log).create('Worker');

        self.promiseCount = 0;
        self.promises = {};

        self.thread = new Worker(workerScriptUrl);
        self.thread.onmessage = function(ev) {
          self._handleWorkerMsg(ev);
        };    

        self._resetWorkerCommandResult();
      },


      _handleWorkerMsg: function(ev) {
        var self = this; 

        // TODO: handle case where not enough entropy is available - can we check before each command to see that we have 
        // enough entropy?

        var obj = {};
        try {
          obj = JSON.parse(ev.data);
        }
        catch(e) {
          self.workerCommand.stdout.exitOk = false;
          return self.log.error('GPG worker thread returned bad data', ev.data);
        }

        // got reference id?
        var defer = null;
        if('id' in obj && (defer = self.promises[obj.id])) {
          // error occurred?
          if ('error' in obj) {
            defer.reject(new GPGError('Errored: ' + defer.desc, self.workerCommand.stdout));
          } else {
            // does this call have notifications
            if (defer.hasUpdates) {
              defer.notify(obj);
            } 
            // this call is done
            else {              
              if (self.workerCommand.exitOk) {
                defer.resolve(self.workerCommand.stdout);
              } else {
                defer.reject(new GPGError('Failed: ' + defer.desc, self.workerCommand.stdout));
              }
            }
          }
        }

        if(obj.cmd) {
          self.workerCommand.stdout.push(obj.contents);
          self.log.debug(obj.contents);

          // check if exit status is non-0
          if (0 === obj.contents.indexOf('Exit Status')) {
            self.workerCommand.exitOk = ('Exit Status: 0' === obj.contents);
          }
        }
      },


      /**
       * Reset object holding results of current worker command.
       */
      _resetWorkerCommandResult: function() {
        this.workerCommand = {
          stdout: [],
          exitOk: true
        }
      },



      /**
       * Create a new Deferred object and add it to the worker's list of active Deferred objects.
       *
       * @param [options] {Object} additional options.
       * @param [options.hasUpdates] {Boolean} true if this Deferred will emit updates prior to being resolved. Default is false.
       *
       * @return {Deferred}
       */
      _newTrackableDeferred: function(options) {
        var self = this;

        options = options || {};

        var defer = $q.defer();
        defer.id = (++self.promiseCount);
        defer.desc = options.desc || '';
        defer.hasUpdates = options.hasUpdates ? true : false;
        self.promises[defer.id] = defer;

        // Remove this Deferred from the queue of pending promises;
        defer.dequeue = function() {
          delete self.promises[defer.id];
        };
        // Auto-remove once promise is resolved/rejected
        defer.promise.finally(function() {
          defer.dequeue();
        });

        return defer;
      },



      /**
       * Analyse given path.
       * @return {filename: ..., path: ...}
       */
      _analysePath: function(path_in) {
        var is_path_only = (path_in[path_in.length-1] === '/');

        var filename, path;
        if(is_path_only) {
          filename = '';
          path = path_in;
        }
        else {
          var elements = path_in.split('/');
          filename = elements[elements.length-1];
          path = path_in.substr(0, path_in.length-filename.length);
        }
        return {
          filename: filename,
          path:     path
        };
      },



      mkdir: function(pseudo_path) {
        var self = this;

        var defer = self._newTrackableDeferred({
          desc: 'mkdir: ' + pseudo_path
        });

        self.thread.postMessage(JSON.stringify({
          cmd:         'mkdir',
          id:          defer.id,
          pseudo_path: '/',
          pseudo_name: pseudo_path
        }));

        return defer.promise;
      },



      /**
       * Get contents of given files in the virtual filesystem.
       * @param ... each argument is a file name (it is assumed that there are no duplicates)
       * @return {Promise} resolves to {file name : file contents}
       */
      getFiles: function() {
        var self = this;

        var pseudo_files = Array.prototype.slice.call(arguments);

        var defer = self._newTrackableDeferred({
          desc: 'getFiles: ' + pseudo_files.join(', ')
        });
        var contents = {};

        for (var i in pseudo_files)
          (function(fname) {
            self.getFile(fname)
              .then(function(c) {
                contents[fname] = c;
                if(Object.keys(contents).length === pseudo_files.length)
                  defer.resolve(contents);
              })
              .catch(defer.reject)
            ;
          })(pseudo_files[i]);

        return defer.promise;
      },



      /**
       * Get contents of given file in the virtual filesystem.
       * @param pseudo_file {string} path to file.
       * @return {Promise} resolves to file contents
       */
      getFile: function(pseudo_file) {
        var self = this;

        var file = self._analysePath(pseudo_file),
          defer1 = self._newTrackableDeferred({
            desc: 'getFile: ' + pseudo_file,
            hasUpdates: true
          }),
          defer2 = $q.defer()
        ;

        // make the call
        self.thread.postMessage(JSON.stringify({
          cmd:         'getFile',
          id:          defer1.id,
          pseudo_path: file.path,
          pseudo_name: file.filename
        }));

        var chunks = [];
        // handle next chunk of the file returned
        defer1.promise.then(null, defer2.reject, function(msg) {
          var id = msg.chunk_id;
          chunks[id] = msg.contents;

          // TODO: rewrite this by inserting a completion callback within the getFile() worker code - so that we don't have to 
          // use chunks to check for completion
          var complete = true;
          for(var i = 0; i < msg.chunk_count; i++) {
            if('undefined' === typeof(chunks[i])) {
              complete = false;
              break;
            }
          }

          // got all chunks?
          if (complete) {
            defer1.dequeue(); // need to do this so that finally gets triggered!
            defer2.resolve(chunks.join(''), file.path, file.filename);
          }
        });

        return defer2.promise;
      },


      /**
       * Add data to file.
       * @param contents {string} data to append to file.
       * @param pseudo_path {string} path to file in virtual filesystem.
       * @return {Promise}
       */
      addData: function(contents, pseudo_path) {
        var self = this;
        
        self.log.debug('Add data to ' + pseudo_path);

        var dst = self._analysePath(pseudo_path),
          defer = self._newTrackableDeferred({
            desc: 'addData to ' + pseudo_path
          });

        self.thread.postMessage(JSON.stringify({
          cmd:         'addData',
          id:          defer.id,
          contents:    contents,
          pseudo_path: dst.path,
          pseudo_name: dst.filename
        }));

        return defer.promise;
      },



      /**
       * Run given GPG command.
       *
       * In order to accurately capture stdout for each GPG command only run one at a time.
       *  
       * @return {Promise} resolves to stdout (array of strings) result from executing command.
       */
      run: function() {
        var self = this;

        var args = Array.prototype.slice.call(arguments);

        var defer = null;

        return self.waitUntilReady()
          .then(function runCommand() {
            args = ['--yes', '--verbose', '--lock-never', '--batch'].concat(args);

            defer = self._newTrackableDeferred({
              desc: '' + args.join(' ')
            });
            self.log.debug('gpg2 ' + defer.desc);

            self._resetWorkerCommandResult();

            self.thread.postMessage(JSON.stringify({
              cmd:         'run',
              id:          defer.id,
              args:        args
            }));

            return defer.promise;
          })
            .then(function returnStdoutResult() {
              return self.workerCommand.stdout;
            })
        ;
      },



      /**
       * Wait for all outstanding calls to be resolved.
       * @return {Promise}
       */
      waitUntilReady: function() {
        return $q.all(this.promises);
      }

    });

  });


  app.factory('GPGUtils', function(GPGError) {

    // From 9.1 and 9.2 in http://www.ietf.org/rfc/rfc4880.txt
    var PGP_PK_ALGO_IDS = {
      1: 'RSA (Encrypt or Sign)',
      2: 'RSA (Encrypt-Only)',
      3: 'RSA (Sign-Only)',
      16: 'Elgamal (Encrypt-Only)',
      17: 'DSA (Digital Signature Algorithm)',
      18: 'Reserved for Elliptic Curve',
      19: 'Reserved for ECDSA',
      20: 'Reserved (formerly Elgamal Encrypt or Sign)',
      21: 'Reserved for Diffie-Hellman (X9.42, as defined for IETF-S/MIME)',
      100: 'Private/Experimental algorithm',
      101: 'Private/Experimental algorithm',
      102: 'Private/Experimental algorithm',
      103: 'Private/Experimental algorithm',
      104: 'Private/Experimental algorithm',
      105: 'Private/Experimental algorithm',
      106: 'Private/Experimental algorithm',
      107: 'Private/Experimental algorithm',
      108: 'Private/Experimental algorithm',
      109: 'Private/Experimental algorithm',
      1010: 'Private/Experimental algorithm'
    };


    var constructKeyInfo = function(tokens) {
      var key = {};
      key.trusted = ('u' === tokens[1]);
      key.bits = (0 < tokens[2].length) ? parseInt(tokens[2], 10) : '0';
      key.algorithm = (0 < tokens[3].length) ? PGP_PK_ALGO_IDS[parseInt(tokens[3],10)] : 'Unknown';
      key.hash = tokens[4];
      key.created = new Date(parseInt(tokens[5], 10) * 1000);
      key.expires = (0 < tokens[6].length) ? new Date(parseInt(tokens[6], 10) * 1000) : null;

      key.caps = {};
      var caps = tokens[tokens.length-2];
      for (var j=0; caps.length>j; ++j) {
        switch (caps[j]) {
          case 's':
            key.caps.sign = true;
            break;
          case 'c':
            key.caps.certify = true;
            break;
          case 'e':
            key.caps.encrypt = true;
            break;
        }
      }

      return key;
    };



    var constructKeyIdentity = function(tokens) {
      return {
        trusted: ('u' === tokens[1]),
        created: new Date(parseInt(tokens[5], 10)),
        expires: (0 < tokens[6].length) ? new Date(parseInt(tokens[6], 10)) : null,
        hash: tokens[7],
        text: (tokens[9] || '').trim()
      };      
    }


    return {
      /**
       * Parse the list of keys returned by GPG2.
       *
       * The list is assumed to be in machine-parseable format generated using the `--with-colons` options.
       * 
       * @param {Array} stdout List of strings representing the stdout holding the key list.
       * @return {Array} List of objects specifying each key.
       */
      parseKeyList: function(stdout) {
        var keys = [],
          currentKey = null;

        for (var i = 0; stdout.length > i; ++i) {
          var str = stdout[i];

          var tokens = str.split(':');

          switch (tokens[0]) {
            case 'pub':
              var currentKey = constructKeyInfo(tokens);
              keys.push(currentKey);

              currentKey.identities = [];
              currentKey.subKeys = [];
              break;
            case 'uid':
              var uid = constructKeyIdentity(tokens);

              if (currentKey) {
                currentKey.identities.push(uid);
              }
              break;
            case 'sub':
              var subKey = constructKeyInfo(tokens);

              if (currentKey) {
                currentKey.subKeys.push(subKey);
              }
              break; 
          }
        }

        return keys;
      },



      /**
       * Check that GPG verified input as a Good Signature
       * 
       * @param {Array} stdout List of strings representing the stdout.
       * @return {Boolean} true if good signature, false otherwise
       */
      isGoodSignature: function(stdout) {
        for (var i=0; i<stdout.length; ++i) {
          if (0 <= stdout[i].indexOf('gpg: Good signature from')) {
            return true;
          }
        }

        return false;
      },



      /**
       * Get whether given string is PGP encrypted.
       * 
       * @param {String} str The string.
       * @return {Boolean} true if so, false otherwise
       */
      isEncrypted: function(str) {
        return 0 === str.indexOf('----- BEGIN PGP MESSAGE -----');
      },



      /**
       * TODO: do we really want to support this? Even the RFC recommends detached signing
       * 
       * Get whether the given text is clear-signed.
       *
       * Clear-signed means that the PGP signature is inline.
       * 
       * @param  {String}  txt The text.
       * @return {Boolean}     True if so; false otherwise.
       */
    //   isClearSigned: function(txt) {
    //     var tokens = txt.split("\n");

    //     if (7 > tokens.length) {
    //       return false;
    //     }

    //     /* See http://tools.ietf.org/html/rfc4880#section-7 */

    //     if (0 !== tokens[0].indexOf('----- BEGIN PGP SIGNED MESSAGE -----')) {
    //       return false;
    //     }

    //     if (0 !== tokens[1].indexOf('Hash:')) {
    //       return false;
    //     }

    //     var sigFound = 0;

    //     for (var j=2; tokens.length>j; ++j) {
    //       if (0 === sigFound) {
    //         if (0 === tokens[j].indexOf('----- BEGIN PGP SIGNATURE -----')) {
    //           sigFound++;
    //         }
    //       } 
    //       else if (1 === sigFound) {
    //         if (0 === tokens[j].indexOf('----- END PGP SIGNATURE -----')) {
    //           sigFound++;
    //         }            
    //       }
    //     }

    //     if (2 > sigFound) {
    //       return false;
    //     }

    //     return true;
    //   },
    };

  });




}(angular.module('App.crypto', ['App.common'])));

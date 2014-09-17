#!/usr/bin/env node

var ploy = require('ploy');
var argv = require('optimist')
    .boolean([ 'q', 'quiet', 'v', 'verbose' ])
    .argv
;
var exec = require('child_process').exec;
var hyperquest = require('hyperquest');
var defined = require('defined');
var qs = require('querystring');
var split = require('split');
var through = require('through');
var Discover = require('node-discover');
var discover;
var map = require('dank-map');
var table = require('text-table');
var url = require('url');
var concat = require('concat-stream');

var fs = require('fs');
var path = require('path');

var cmd = argv._[0];
var advertisement = {};
var localRepos = {};


if (cmd === 'help' || argv.h || argv.help || process.argv.length <= 2) {
    var h = argv.h || argv.help || argv._[1];
    var helpFile = typeof h === 'string' ? h : 'usage';
    
    var rs = fs.createReadStream(__dirname + '/' + helpFile + '.txt')
    rs.on('error', function () {
        console.log('No help found for ' + h);
    });
    rs.pipe(process.stdout);
}
else if (cmd === 'list' || cmd === 'ls') {
    showList(0, {
        verbose: argv.verbose || argv.v,
        format: argv.format,
        type: 'branch'
    });
}
else if (cmd === 'work') {
    showList(0, {
        format: argv.format,
        type: 'work'
    });
}
else if (cmd === 'clean') {
    getRemote(function (err, remote) {
        var hq = hyperquest(remote + '/clean');
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'move' || cmd === 'mv') {
    argv._.shift();
    var src = argv.src || argv._.shift();
    var dst = argv.dst || argv._.shift();
    getRemote(function (err, remote) {
        if (err) return error(err);
        
        var hq = hyperquest(remote + '/move/' + src + '/' + dst);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'restart') {
    argv._.shift();
    var name = argv.name || argv._.shift();
    getRemote(function (err, remote) {
        if (err) return error(err);
        
        var hq = hyperquest(remote + '/restart/' + name);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'stop') {
    argv._.shift();
    var name = argv.name || argv._.shift();
    getRemote(function (err, remote) {
        if (err) return error(err);

        var hq = hyperquest(remote + '/stop/' + name);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'start') {
    argv._.shift();
    var name = argv.name || argv._.shift();
    getRemote(function (err, remote) {
        if (err) return error(err);

        var hq = hyperquest(remote + '/start/' + name);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'redeploy') {
    argv._.shift();
    var branch = argv.branch || argv._[0];
    getRemote(function (err, remote) {
        if (err) return error(err);
        var hq = hyperquest(remote + '/redeploy/' + branch);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'remove' || cmd === 'rm') {
    argv._.shift();
    var name = argv.name || argv._.shift();
    getRemote(function (err, remote) {
        if (err) return error(err);
        
        var hq = hyperquest(remote + '/remove/' + name);
        hq.pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}
else if (cmd === 'log' && argv._.length) {
    argv._.shift();
    
    getRemote(function (err, remote) {
        if (err) return error(err);
        var begin = defined(argv.begin, argv.b);
        var end = defined(argv.end, argv.e);
        var follow = defined(argv.follow, argv.f);
        
        if (argv.n === 0) {
            end = 0;
        }
        else if (argv.n !== undefined) {
            begin = -argv.n;
            end = undefined;
        }
        
        if (begin === undefined && process.stdout.rows) {
            begin = 2 - process.stdout.rows;
        }
        
        var params = { begin: begin, end: end, follow: follow };
        var showColor = defined(argv.color, process.stdout.isTTY);
        if (showColor === 'false') showColor = false;
        
        params.name = argv.name || (argv._.length ? argv._ : undefined);
        if (Array.isArray(params.name) && params.name.length === 1) {
            params.name = params.name[0];
        }
        var multiMode = !params.name || Array.isArray(params.name);
        
        Object.keys(params).forEach(function (key) {
            if (params[key] === undefined) delete params[key];
        });
        
        var href = remote + '/log?' + qs.stringify(params);
        var hq = hyperquest(href);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
        
        var keys = [];
        hq.pipe(split()).pipe(through(function (line) {
            if (!multiMode) return this.queue(line.replace(/^\d+ /, '') + '\n');
            
            var m = /^(\S+)/.exec(line);
            var branch = m && m[1];
            var msg = line.replace(/^\S+ \d+ /, '');
            
            if (!showColor) return this.queue('[' + branch + '] ' + msg + '\n');
            
            if (keys.indexOf(branch) < 0) keys.push(branch);
            
            var color = 31 + (keys.indexOf(branch) % 6);
            this.queue(
                '\033[01;' + color + 'm[' + branch + ']'
                + '\033[0m ' + msg + '\n'
            );
            
        })).pipe(process.stdout);
    });
}
else if (true || cmd === 'server') {
    // `ploy` server mode without `ploy server` is scheduled for demolition
    if (cmd === 'server') argv._.shift();
    
    var dir = path.resolve(argv.dir || argv.d || argv._.shift() || '.');
    var authFile = argv.auth || argv.a;
    var port = argv.port || argv.p || 80;
    var clusterName = argv.name || argv.n || "";
    
    var opts = {
        repodir: path.join(dir, 'repo'),
        workdir: path.join(dir, 'work'),
        logdir: path.join(dir, 'log'),
        auth: authFile && JSON.parse(fs.readFileSync(authFile))
    };
    
    var server = ploy(opts);
    
    //over ride the server handle
    server.handle = CloysterHandle;
    
    var discoverOpts = {
        key : ['ploy', clusterName, JSON.stringify(opts.auth)].join('-')
    };

    discover = new Discover(discoverOpts);

    server.on('spawn', function (ps, info) {
        updateLocalRepos(info);
        updateAvertisement(info);
        
        if (discover.me.isMaster) {
            //push to slaves
            maybePushToNodes(info, false);
        }
        else {
            //push to masters
            maybePushToNodes(info, true);
        }
    });
    
    discover.on('promotion', function () {
        maybePushAllToSlaveNodes(); 
    });
    
    discover.on('added', function (node) {
        if (discover.me.isMaster) {
            maybePushAllToSlaveNodes(node); 
        }
    });
    
    if (!argv.q && !argv.quiet) {
        server.on('spawn', function (ps, info) {
            ps.stdout.pipe(process.stdout, { end: false });
            ps.stderr.pipe(process.stderr, { end: false });
        });
    }
    var opts = {};
    if (argv.f) {
        try { opts.bouncer = require(argv.f) }
        catch (e) { opts.bouncer = require(path.resolve(argv.f)) }
    }

    server.listen(port, opts);
    
    advertisement.ploy = {
        port : port
        , repos : {}
    };

    discover.advertise(advertisement);

    if (argv.cert || argv.ca || argv.pfx) {
        var sopts = { bouncer: opts.bouncer };
        if (argv.ca) sopts.ca = unbundle(fs.readFileSync(argv.ca, 'utf8'));
        if (argv.key) sopts.key = fs.readFileSync(argv.key);
        if (argv.cert) sopts.cert = fs.readFileSync(argv.cert);
        if (argv.pfx) sopts.pfx = fs.readFileSync(argv.pfx);
        sopts.honorCipherOrder = true;
        sopts.port = argv.sslPort || argv.s || 443;
        server.listen(sopts);
    }
}

function error (err) {
    console.error(err);
    process.exit(1);
}

function getRemote (cb) {
    getRemotes(function (err, remotes) {
        if (err) cb(err)
        else if (remotes.length === 0) {
            cb('No matching ploy remotes found. Add a remote or use -r.');
        }
        else if (remotes.length >= 2) {
            cb('More than one matching ploy remote. Disambiguate with -r.');
        }
        else cb(null, remotes[0]);
    });
}

function getRemotes (cb) {
    var r = argv.r || argv.remote;
    if (/^https?:/.test(r)) {
        if (!/\/_ploy\b/.test(r)) r = r.replace(/\/*$/, '/_ploy');
        return cb(null, [ r.replace(/\/_ploy\b.*/, '/_ploy') ]);
    }
    
    exec('git remote -v', function (err, stdout, stderr) {
        if (err) return cb(err);
        
        var remotes = stdout.split('\n').reduce(function (acc, line) {
            var xs = line.split(/\s+/);
            var name = xs[0], href = xs[1];
            var re = RegExp('^https?://[^?#]+/_ploy/[^?#]+\\.git$');
            if (re.test(href)) {
                acc[name] = href.replace(RegExp('/_ploy/.+'), '/_ploy');
            }
            return acc;
        }, {});
        
        if (r) cb(null, [ remotes[r] ].filter(Boolean));
        else cb(null, Object.keys(remotes).map(function (name) {
            return remotes[name];
        }));
    });
}

function showList (indent, opts) {
    if (!indent) indent = 0;
    if (!opts) opts = {};
    
    getRemote(function (err, remote) {
        if (err) return error(err);
        
        var uri = remote + '/list';
        if (opts.format) uri += '?format=' + opts.format
        else if (opts.verbose) uri += '?format=branch,hash,repo,port'
        
        var buf = [];
        var hq = hyperquest(uri);
        hq.on('data', function (chunk) {
           buf.push(chunk); 
        });
        hq.on('end', function () {
           var data = JSON.parse(buf.join(''));
           var list = [
                ['node', 'repo', 'branch', 'key', 'port', 'hash'],
                ['----', '----', '------', '---', '----', '----']
            ];
        
           map(data, function (nodeName, branches) {
               map(branches, function (branchName, branch) {
                    list.push([
                        nodeName || "",
                        branch.repo || "",
                        branch.branch || "",
                        branch.key || "",
                        branch.port || "",
                        branch.hash || ""
                    ]);
                });
           });

           if (opts.format == 'json') {
                console.log(JSON.stringify(data));
           }
           else {
               console.log(table(list));
           }
        });
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
}

function CloysterHandle (req, res) {
    var self = this;
    var m;

    res.setHeader('Connection', 'close');

    if (RegExp('^/_ploy/[^?]+\\.git\\b').test(req.url)) {
        req.url = req.url.replace(RegExp('^/_ploy/'), '/');
        self.ci.handle(req, res);
    }
    else if (RegExp('^/_ploy/move/').test(req.url)) {
        CloysterHandle.move.call(self, req, res);
    }
    else if (RegExp('^/_ploy/moveLocal/').test(req.url)) {
        CloysterHandle.moveLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/remove/').test(req.url)) {
        CloysterHandle.remove.call(self, req, res);
    }
    else if (RegExp('^/_ploy/removeLocal/').test(req.url)) {
        CloysterHandle.removeLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/list(\\?|$)').test(req.url)) {
        CloysterHandle.list.call(self, req, res);
    }
    else if (RegExp('^/_ploy/listLocal(\\?|$)').test(req.url)) {
        CloysterHandle.listLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/clean(\\?|$)').test(req.url)) {
    	CloysterHandle.clean.call(self, req, res);
    }
    else if (RegExp('^/_ploy/cleanLocal(\\?|$)').test(req.url)) {
    	CloysterHandle.cleanLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/restart/').test(req.url)) {
        CloysterHandle.restart.call(self, req, res);
    }
    else if (RegExp('^/_ploy/restartLocal/').test(req.url)) {
        CloysterHandle.restartLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/stop/').test(req.url)) {
    	CloysterHandle.stop.call(self, req, res);
    }
    else if (RegExp('^/_ploy/stopLocal/').test(req.url)) {
    	CloysterHandle.stopLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/start/').test(req.url)) {
    	CloysterHandle.start.call(self, req, res);
    }
    else if (RegExp('^/_ploy/startLocal/').test(req.url)) {
    	CloysterHandle.startLocal.call(self, req, res);
    }
    else if (RegExp('^/_ploy/redeploy/').test(req.url)) {
    	CloysterHandle.redeploy.call(self, req, res);
    }
    else if (RegExp('^/_ploy/redeployLocal/').test(req.url)) {
    	CloysterHandle.redeployLocal.call(self, req, res);
    }
    else if (m = RegExp('^/_ploy/log(?:$|\\?)').exec(req.url)) {
        CloysterHandle.log.call(self, req, res);
    }
};

CloysterHandle.list = function(req, res) {
    var self = this;
    var params = qs.parse((url.parse(req.url).search || '').slice(1));
    var format = String(params.format || 'branch').split(',');

    var result = {};

    propogateCommand('listLocal', function (err, lists) {
        lists.forEach(function (list) {
            var remote = list.node.address + ':' + list.node.advertisement.ploy.port;

            result[remote] = list.response;
        });

        res.end(JSON.stringify(result));
    });
}

CloysterHandle.listLocal = function (req, res) {
    var self = this;
    var params = qs.parse((url.parse(req.url).search || '').slice(1));
    var format = String(params.format || 'branch').split(',');
    
    var result = {}
    
    map(self.branches, function (branchName, obj) {
        result[branchName] = {};
        
        ['port','hash','repo','branch','key'].forEach(function (col) {
            result[branchName][col] = obj[col];
        });
    });
    
    res.end(JSON.stringify(result));
};

CloysterHandle.clean = function (req, res) {
    var self = this;
    
    var errors = [];

    propogateCommand('cleanLocal', function (err, responses) {
        responses.forEach(function (response) {
            errors = errors.concat(response.response.errors || [])
        });

        if (errors.length) {
            res.statusCode = 500;
        }

        res.end(JSON.stringify(responses));
    });
}

CloysterHandle.cleanLocal = function (req, res) {
    var self = this
   
    var errors = [];

    self.clean(function (err) {
        if (err) {
            res.statusCode = 500;
            errors.push(err);
        }

        res.end(JSON.stringify({
            errors : errors
        }));
    });
}

CloysterHandle.log = function (req, res) {
    //TODO: this needs to be modified to multiplex all of the slave log streams

    var self = this;
    var params = qs.parse((url.parse(req.url).search || '').slice(1));
    var b = Number(params.begin);
    var e = Number(params.end);
    if (isNaN(b)) b = undefined;
    if (isNaN(e)) e = undefined;
    req.connection.setTimeout(0);
    
    var ld = self.logdir.open(params.name);
    res.on('close', function () { ld.close() });
    
    if (falsey(params.follow)) {
        var s = ld.slice(b, e);
        s.on('error', function (err) { res.end(err + '\n') });
        s.pipe(res);
    }
    else {
        var fw = ld.follow(b, e);
        fw.on('error', function (err) { res.end(err + '\n') });
        fw.pipe(res);
    } 
}

CloysterHandle.restart = function (req, res) {
    var self = this;
    var name = req.url.split('/')[3];
    
    propogateCommand('restartLocal/' + name, function (err, responses) {
        res.end(JSON.stringify(responses));
    });
}

CloysterHandle.restartLocal = function (req, res) {
    var self = this;
    var name = req.url.split('/')[3];
    self.restart(name);
    res.end();   
};

CloysterHandle.remove = function (req, res) {
    var self = this;
    var name = req.url.split('/')[3];
    
    propogateCommand('removeLocal/' + name, function (err, responses) {
        res.end(JSON.stringify(responses));
    });
}

CloysterHandle.removeLocal = function (req, res) {
    var self = this;
    var name = req.url.split('/')[3];
    self.remove(name);
    res.end();
}

CloysterHandle.move = function (req, res) {
    var self = this;
    var xs = req.url.split('/').slice(3);
    var src = xs[0], dst = xs[1];
    
    propogateCommand('moveLocal/' + src + '/' + dst, function (err, responses) {
        res.end(JSON.stringify(responses));
    });
}

CloysterHandle.moveLocal = function (req, res) {
    var self = this;
    var xs = req.url.split('/').slice(3);
    var src = xs[0], dst = xs[1];
    self.move(src, dst);
    res.end();   
}

function propogateCommand (command, cb) {
    var waiting = 0;
    var responses = [];

    if (Object.keys(discover.nodes).length === 0) {
        return maybeFinish();
    }
 
    //execute the command on the local server
    processNode(discover.me);

    //execute command on each known remote
    discover.eachNode(processNode);

    function processNode (node) {
        waiting += 1;

        var remoteNode = node.address + ':' + node.advertisement.ploy.port;
        var hq = hyperquest('http://' + remoteNode + '/_ploy/' + command);
        
        hq.on('error', maybeFinish);

        hq.pipe(concat(function (data) {
	        var obj;
            
            try {
                obj = JSON.parse(data.toString());
            }
            catch (e) {
                obj = {}
            }

            responses.push({
                node : node
                , response : obj
            });

            maybeFinish();
    	}));
    };

    function maybeFinish() {
        waiting -= 1;

        if (waiting <= 0) {
            cb(null, responses);
        }
    }
}

function updateAvertisement(info) {
    var commit = info.commit;
    var repos = advertisement.ploy.repos;
    var repo = repos[commit.repo] = repos[commit.repo] || { branches : {}};
    var branches = repo.branches;
    var branch = branches[commit.branch] = branches[commit.branch] || {};
    branch.hash = commit.hash;
    
    discover.advertise(advertisement);
}

function updateLocalRepos(info) {
    var commit = info.commit;
    
    var repo = localRepos[commit.repo] = localRepos[commit.repo] || { branches : {}};
    var branches = repo.branches;
    branches[commit.branch] = info;
}

function maybePushAllToSlaveNodes () {
    map(localRepos, function (repoName, repo) {
       map(repo.branches, function (branchName, info) {
           //push to slave nodes
           maybePushToNodes(info, false);
       });
    });
}

function maybePushToNodes(info, toMaster) {
    //check which slave nodes do not have this repo/branch/hash
    discover.eachNode(function (node) {
        if (toMaster && !node.isMaster) {
            return;
        }
        
        var advert = node.advertisement;
        
        if (!(advert.ploy && advert.ploy.port && advert.ploy.repos)) {
            return;
        }
        
        var remoteNode = {
            address : node.address
            , port : advert.ploy.port
            , remote : 'ploy_' + node.address + '_' + advert.ploy.port
        };
        
        if (!advert.ploy.repos[info.commit.repo]) {
            return pushToRemoteNode(info, remoteNode);
        }
        
        var repo = advert.ploy.repos[info.commit.repo];
        
        if (!repo.branches[info.commit.branch]) {
            return pushToRemoteNode(info, remoteNode);
        }
        
        var branch = repo.branches[info.commit.branch];
        
        if (branch.hash !== info.commit.hash) {
            return pushToRemoteNode(info, remoteNode);
        }
    });
}

function pushToRemoteNode(info, node) {
    //make sure a remote is set up
    addRemote(info, node, function (err) {
        //if (err) return console.log(err);
              
        //build remote push command
        var cmd = [
            'git push'
            , node.remote
            , info.commit.branch
        ].join(' ');
        
        //push to the remote
        exec(cmd, { 
            cwd : info.commit.dir
        }, function (err, stdout, stderr) {

        });
    });
}

function addRemote(info, node, cb) {
    var uri = 'http://' + node.address + ':' + node.port + '/_ploy/' + info.commit.repo;
    
    //add a remote to the working dir
    exec('git remote add ' + node.remote + ' ' + uri, { 
        cwd : info.commit.dir
    }, cb);
}

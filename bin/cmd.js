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
var discover = require('node-discover');
var map = require('dank-map');

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
        format: argv.format
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

    var discoverOpts = {
        key : ['ploy', clusterName, JSON.stringify(opts.auth)].join('-')
    };
    var discover = new discover(discoverOpts);

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
    server.listen(port);
    
    advertisement.ploy = {
        port : port
        , repos : {}
    };
    discover.advertise(advertisement);
    
    if (argv.ca || argv.pfx) {
        var sopts = {};
        if (argv.ca) sopts.ca = fs.readFileSync(argv.ca);
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
        
        var hq = hyperquest(uri);
        hq.pipe(split()).pipe(through(function (line) {
            this.queue(Array(indent+1).join(' ') + line + '\n');
        })).pipe(process.stdout);
        hq.on('error', function (err) {
            var msg = 'Error connecting to ' + remote + ': ' + err.message;
            console.error(msg);
        });
    });
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
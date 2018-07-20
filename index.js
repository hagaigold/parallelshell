#!/usr/bin/env node

'use strict';
var spawn = require('child_process').spawn;

var sh, shFlag, children, args, wait, cmds, verbose, i, len;
var debug = false, experimental = false, globalEnv = {};

// parsing argv
cmds = [];
args = process.argv.slice(2);
for (i = 0, len = args.length; i < len; i++) {
    if (args[i][0] === '-') {
        switch (args[i]) {
            case '-w':
            case '--wait':
                wait = true;
                break;
            case '-v':
            case '--verbose':
                verbose = true;
                break;
            case '-d':
            case '--debug':
                debug = true;
                break;
            case '-e':
            case '--experimental':
                experimental = true;
                break;
            case '-h':
            case '--help':
                console.log('-h, --help         output usage information');
                console.log('-v, --verbose      verbose logging')
                console.log('-w, --wait         will not close sibling processes on error')
                process.exit();
                break;
        }
    } else if (experimental && args[i].indexOf(' ') < 0 && args[i].indexOf('=') > 0) {
        var [ge, ] = getEnv(args[i]);
        Object.assign(globalEnv, ge);
    } else {
        cmds.push(args[i]);
    }
}

// called on close of a child process
function childClose (code) {
    var i, len;
    code = code ? (code.code || code) : code;
    if (verbose) {
        if (code > 0) {
            console.error('`' + this.cmd + '` failed with exit code ' + code);
        } else {
            console.log('`' + this.cmd + '` ended successfully');
        }
    }
    if (code > 0 && !wait) close(code);
    status();
}

function status () {
    if (verbose) {
        var i, len;
        console.log('\n');
        console.log('### Status ###');
        for (i = 0, len = children.length; i < len; i++) {
            if (children[i].exitCode === null) {
                console.log('`' + children[i].cmd + '` is still running');
            } else if (children[i].exitCode > 0) {
                console.log('`' + children[i].cmd + '` errored');
            } else {
                console.log('`' + children[i].cmd + '` finished');
            }
        }
        console.log('\n');
    }
}

// closes all children and the process
function close (code) {
    var i, len, closed = 0, opened = 0;

    for (i = 0, len = children.length; i < len; i++) {
        if (!children[i].exitCode) {
            opened++;
            children[i].removeAllListeners('close');
            children[i].kill("SIGINT");
            if (verbose) console.log('`' + children[i].cmd + '` will now be closed');
            children[i].on('close', function() {
                closed++;
                if (opened == closed) {
                    process.exit(code);
                }
            });
        }
    }
    if (opened == closed) {process.exit(code);}

}

// cross platform compatibility
if (process.platform === 'win32') {
    sh = 'cmd';
    shFlag = '/c';
} else {
    sh = 'sh';
    shFlag = '-c';
}

if (debug) {
    console.log('args: %o',args);
    console.log('globals: %o',globalEnv);
    console.log('cmds: %o',cmds);
}

// start the children
var children = [];
cmds.forEach(function (cmd) {
    if (debug) {
        console.log('cmd: ' + cmd);
    }

    var childEnv = {};
    if (experimental) {
        [childEnv, cmd] = getEnv(cmd);
    }

    if (process.platform != 'win32') {
      cmd = "exec "+cmd;
    }
    var child = spawn(sh,[shFlag,cmd], {
        cwd: parseInt(process.versions.node) < 8 ? process.cwd : process.cwd(),
        env: Object.assign({}, process.env, globalEnv, childEnv),
        stdio: ['pipe', process.stdout, process.stderr]
    })
    .on('close', childClose);
    child.cmd = cmd
    children.push(child)
});

// close all children on ctrl+c
process.on('SIGINT', close)

//
// A very *simple* environment variables parsing.
//  for much better implementation, please see cross-env package:
//  https://github.com/kentcdodds/cross-env
//
function getEnv(cmd) {
    var j, len, e = {};
    var rest = null;
    const chunks = cmd.split(' ');
    for (j = 0, len = chunks.length; j < len; j++) {
        // skip empty chunks.
        if (chunks[j] === '') {
            continue;
        }

        const varValuePair = chunks[j].split('=')
        if (varValuePair.length === 2) {
            if (debug) {
                console.log('env var: ' + chunks[j]);
            }
            e[varValuePair[0]] = varValuePair[1];
        } else {
            // no more variables.
            rest = chunks.slice(j).join(' ');
            break;
        }
    }

    return [e, rest];
}

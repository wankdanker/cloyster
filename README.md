cloyster
--------

Think [ploy](https://github.com/substack/ploy) + [node-discover](https://github.com/wankdanker/node-discover)

Any ploy server you start via `cloyster` will discover other cloyster processes on the network and
automatically propogate your git deployments to all other nodes within the cluster.

There is work to be done but this is already usable.

status
------

Currently pushing to a single node and propogating to all other nodes works. Commands such as `ls`, `log`,
`mv`, `rename`, etc do not propogate throughout the network.

install
-------

```bash
npm install -g cloyster
```

usage
-----

```
usage:

  cloyster server DIRECTORY PORT
  cloyster server { -d DIRECTORY | -p PORT | -a AUTHFILE }

    Create a ploy http server, hosting repositories in DIRECTORY and listening
    on PORT for incoming connections.
 
    If AUTHFILE is given, it should be a json file that maps usernames to
    token strings to use for basic auth protection for ploy actions.
    
    Type `ploy help ssl` to show ssl options.
 
  cloyster ls { -r REMOTE | --verbose, -v | --format=FORMAT }
 
    List the running process branch names at REMOTE.
    
    Verbose formatting will use `branch,hash,repo,port`.
 
  cloyster log NAME { -n ROWS | -f | -b BEGIN | -e END }

    Show ROWS of log output for the branch NAME like `tail`.
    Default -n value: screen height.
 
    Stream live updates when `-f` is set like `tail -f`.
    Slice log records for NAME directly with `-b` and `-e`.
 
  cloyster log { -n ROWS | -f | -b BEGIN | -e END | --color=true }

    Show ROWS of log output for all branches.
    Lines will be prefaced with a colored branch name when stdout is a tty.

  cloyster mv SRC DST { -r REMOTE }
 
    Move the branch name SRC to the DST branch name at REMOTE.
 
  cloyster rm NAME { -r REMOTE }
 
    Remove the branch name at NAME, killing any running processes.
 
  cloyster restart NAME { -r REMOTE }
 
    Restart the process at NAME.
 
  cloyster help [TOPIC]
 
    Show this message or optionally a TOPIC.
    
    Topics: ssl

OPTIONS

  For `cloyster ls`, `cloyster mv`, `cloyster rm` commands that take a REMOTE parameter:
  
  REMOTE can be a git remote name or a remote URL to a ploy server. If there
  is exactly one ploy remote in set up as a git remote, it will be used by
  default.
```

license
-------

MIT

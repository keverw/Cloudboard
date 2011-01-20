var nextClientId = 1 //1 is our next id
var serverStartTime = Math.round((new Date()).getTime()/1000); //store start time so that we don't mix serverIds
var url = require('url');
var sys = require('util');

//constants
var connectionLive = 1500000; //25 mins
var ipStreamLimit = 6;

function checkUser(request, response, user, ip) {
    try {
        if (users.getUser(user)) {
            return true;
        }
    } catch (e) {
        if (ip && accessedIPs[ip]) { accessedIPs[ip].notFound++; }
        response.completeWrite(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		}, e, 'ascii');
        return false;
    }
}

function checkUserExists(request, response, user, ip) {
    if (checkUser(request, response, user, ip)) {
        response.completeWrite(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	}, "ok", 'ascii');
        return true;
    }
}

/* 
response should be our own version of response
if not, everything SHOULD still work
*/

function waitForUpdate(request, response, user, ip, lastTime) {

    if (!checkUser(request, response, user)) {
        return false;
    }
    
    try {
        //gracefully (not really) close the connection after x amount of time
        //by gracefully I mean, don't let the OS handle it
        //by not that graceful, I mean we call response.connection.end() in order to get the close event to call
        
        var timeout = setTimeout(function() {
            try {
                response.end(true);
            } catch(e){
                try { //fall back to trying normal response
                    response.end();
                    response.connection.end();
                }catch (f) {}
            }
        }, connectionLive);
        
        var connection = users.addListenRequest(user, {request: request, response: response, ip: ip, timeout: timeout}, request.headers['cb-serverid'], lastTime);
    } catch(e) {
        switch (e) {
            case "too_many_listens":
                console.log("user: "+user+" hit too many connections");
                response.completeWrite(400, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, 'too_many_listens', 'ascii');
                return false;
            break
            case "new_id_required":
                //if someone is making a lot of new ids, wtf
                if (ip && accessedIPs[ip]) { accessedIPs[ip].newID++; }
                var id = serverStartTime+'-'+nextClientId++;
                response.completeWrite(201, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, id, 'ascii');
                console.log("New clientID: "+id);
                return false;
            break
            case "invalid_id":
                response.completeWrite(400, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, 'invalid headers', 'ascii');
                return false;
            break
            case "too_many_ip_streams":
                console.log("user: "+user+" on ip: "+listener.ip+" hit too many streams");
                response.completeWrite(403, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, 'too_many_listens', 'ascii');
                return false;
            break
            default:
                console.log("could not initiate listen for user: "+user+" error: "+e);
                response.completeWrite(500, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, 'could_not_initiate_listen', 'ascii');
                return false;
            break            
        }
        return false;
    }
    
    if (!connection) {
        return false;
    }
    
    try {
        request.connection.addListener('close', function () {
            //console.log("closed connection");
            try { clearTimeout(timeout); } catch(e) {}
            users.refreshUserListeners();
        });
        request.connection.addListener('timeout', function () {
            //console.log("timed out connection");
            try { clearTimeout(timeout); } catch(e) {}
            response.end(true);
            users.refreshUserListeners(); //should be called in close but what the heck, why not        
        });
            
        request.connection.setTimeout(connectionLive+10000); //timeout after 10 more seconds after when we should have timed out
        request.connection.setNoDelay(true);
        
        response.writeHead(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	});
    	response.write("-", 'utf8');
    } catch (e) {
        response.end();
        users.refreshUserListeners();
    }
    
    
    
    return true;
}

function minusStreamForIP(ip) {
    if (ip && accessedIPs[ip]) {
        accessedIPs[ip].streams--;
    }
}

function addStreamForIP(ip) {
    if (accessedIPs[ip].streams >= ipStreamLimit) {
        throw "too_many_ip_streams";
    }
    accessedIPs[ip].streams++;
}

function sendPostToUsers(request, response, user, post) {
    
    if (!checkUser(request, response, user, false)) {
        return false;
    }
    
    try {
        if (!post) {
            response.completeWrite(400, {
    			'Content-Type' : 'text/plain',
    			'Access-Control-Allow-Origin' : '*'
    		}, 'invalid_post', 'ascii');
            return false;
        }
    } catch (e) {
        return false;
    }
    try {
        var resp = users.newPost(user, post);
        if (typeof resp != "string") {
            console.log("wtf "+ resp);
            
        }
        //make sure we respond to post
        response.completeWrite(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	}, resp, 'ascii');
        return true;
    } catch (e) {
        console.log("could not post to user: "+user+" with post: "+post+"\n because: "+e);
        response.completeWrite(500, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		}, e, 'ascii');
        return false;
    }
    
}

function getLastUpdatedForUser(request, response, user, ip) {
    
    if (!checkUser(request, response, user, ip)) {
        return false;
    }    
    try {
        var time = users.getLastUpdated(user);
        if (time) {
            response.completeWrite(200, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, time.toString(), 'utf8');
            return true;
        } else {
            response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, "no_time", 'ascii');
            return false;
        }
    } catch (e) {
    	response.completeWrite(500, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	}, e, 'ascii');
    }
    return false;
}

function getInboxForUser(request, response, user, ip) {
    
    if (!checkUser(request, response, user, ip)) {
        return false;
    }    
    try {
        var inbox = inboxes.getUserInbox(user);
        if (inbox && JSON.stringify(inbox)) {
            response.completeWrite(200, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, JSON.stringify(inbox), 'utf8');
            return true;
        } else {
            response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, "{}", 'ascii');
            return false;
        }
    } catch (e) {
        try {
            //need to be careful writing e...
        	response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, e, 'ascii');
        } catch (e) {
            response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, "error sending inbox", 'ascii');
        }
    }
    return false;
}

function sendServerStats(response, connections) {
    var stats = {};
    if (users) {
        stats.users = {};
        stats.users.maxUserID = users.masUserID; //should be our user count...
        stats.users.count = users.length;
        
        stats.streams = {};
        stats.streams.nextClientId = nextClientId;
        stats.streams.openStreams = users.openStreams;
    }
    if (inboxes) {
        stats.inboxes = {};
        stats.inboxes.itemsCount = 0;
        stats.inboxes.activeUsers = 0;
        //inboxes and inboxes and inboxes and inboxes
        inboxes.inboxes.forEach(function(inbox, user) {
            if (inbox.length > 0) {
                stats.inboxes.activeUsers++;
                stats.inboxes.itemsCount += inbox.length;
            }
        });
    }
    
    var secUptime = Math.round(((new Date()).getTime())/1000) - serverStartTime;
    var uptime = '';
    if (secUptime > 172800) { //48 hours
        uptime += Math.floor(secUptime/86400)+'d ';
        secUptime = secUptime%86400;
    }
    if (secUptime > 7200) { //2 hours
        uptime += Math.floor(secUptime/3600)+'h ';
        secUptime = secUptime%3600;
    }
    uptime += secUptime+'s ';    
    stats.uptime = uptime.replace(/\s+$/,""); //right trim
    
    if (connections) stats.connections = connections;
    
    try {
        var string = JSON.stringify(stats);
        response.completeWrite(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	}, string, 'utf8');
    } catch (e) {
        try {
            response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, "couldn't generate stats because: "+e, 'utf8');
        } catch (e) {
            response.completeWrite(500, {
        		'Content-Type' : 'text/plain',
        		'Access-Control-Allow-Origin' : '*'
        	}, "error generating stats", 'utf8');
        }
    }
}

function getIP(req) {
    var ip_address = (req.connection.remoteAddress ? req.connection.remoteAddress : req.remoteAddress);
    //check for cloudflare
    try {
        if (req.headers['cf-connecting-ip']) {
            var ipParts = ip_address.split(".");
            var cloudFlare = false;
            switch (parseInt(ipParts[0])) {
                case 204:
                    //(204.93.177.0 - 204.93.177.255)
                    //(204.93.240.0 - 204.93.240.255)
                    if (parseInt(ipParts[1]) == 93 && (parseInt(ipParts[2]) == 240 || parseInt(ipParts[2]) == 177)) {
                        cloudFlare = true;
                    }
                break
                case 199:
                    //(199.27.128.0 - 199.27.135.255)
                    if (parseInt(ipParts[1]) == 27 && (parseInt(ipParts[2]) < 136 || parseInt(ipParts[2]) > 127)) {
                        cloudFlare = true;
                    }
                break
                case 173:
                    //(173.245.48.0 - 173.245.63.255)
                    if (parseInt(ipParts[1]) == 245 && (parseInt(ipParts[2]) < 64 || parseInt(ipParts[2]) > 47)) {
                        cloudFlare = true;
                    }
                break
            }
            if (cloudFlare) {
                ip_address = req.headers['cf-connecting-ip'];
            }
        }
    } catch (e) {}
    //if (net.isIP(ip_address) != 0) {
        return ip_address;
    //} else {
    //    return false;
    //}
    
}

var accessedIPs = {};

function deleteIPCheck(ip) {
    if (!accessedIPs[ip].blocked && accessedIPs[ip].streams < 2) {
        delete accessedIPs[ip];
    } else {
        accessedIPs[ip].connections = 1;
        accessedIPs[ip].newID = 0;
        accessedIPs[ip].time = (new Date()).getTime();
        accessedIPs[ip].timer = setTimeout(function() {deleteIPCheck(ip);}, connectionLive); //try again in 15 mins
    }
}

function checkIP(ip) {
    var time = (new Date()).getTime();
    if (accessedIPs[ip] && accessedIPs[ip].connections) {
        accessedIPs[ip].connections++;
        if (accessedIPs[ip].blocked) {
            return 3;
        }
        if (accessedIPs[ip].notFound > 4) {
            console.log("too many not founds for: "+ip);
            accessedIPs[ip].blocked = true;
            if (accessedIPs[ip].timer) {
                clearTimeout(accessedIPs[ip].timer);
            }
            accessedIPs[ip].timer = setTimeout(function() {delete accessedIPs[ip];}, 3600000); //one hour blocked
            return 3;
        } else if (accessedIPs[ip].newID > 36) {
            console.log("too many new IDs for: "+ip);
            accessedIPs[ip].blocked = true;
            if (accessedIPs[ip].timer) {
                clearTimeout(accessedIPs[ip].timer);
            }
            accessedIPs[ip].timer = setTimeout(function() {delete accessedIPs[ip];}, 3600000); //one hour blocked
            return 3;
        } else if ((time-accessedIPs[ip].time)/1000 > 6 && accessedIPs[ip].connections > 20 && accessedIPs[ip].connections/((time-accessedIPs[ip].time)/1000)*60 > 400) { //more than 100 a minute
            console.log("too many new connections for: "+ip);
            accessedIPs[ip].blocked = true;
            if (accessedIPs[ip].timer) {
                clearTimeout(accessedIPs[ip].timer);
            }
            accessedIPs[ip].timer = setTimeout(function() {delete accessedIPs[ip];}, 3600000); //30 mins blocked
            return 3;
        } else {
            return 1;
        }
    } else {
        accessedIPs[ip] = {connections: 1, notFound: 0, streams: 0, blocked: false, time: time, newID: 0};
        accessedIPs[ip].timer = setTimeout(function() {deleteIPCheck(ip);}, connectionLive); //clear ip in 15 mins
        return 1;
    }
}

function createPostFromClient(text, query) {    
    try {
        var post = {};
        if (!query.type) {
            post.type = "txt";
        } else {
            post.type = query.type;
        }
        post.time = (new Date()).getTime();
        post.text = text;
        post = JSON.stringify(post);
        return post;
    } catch (e) {
        return false;
    }
}

function betterResponse(resp, stTime) {
    this.startTime = stTime;
    this.connection = resp.connection;
    this.socket = resp.socket;
    this.response = resp;
    this.canWrite = true; //unset on end()
    this.headSent = false;
    this.ended = false;
    this.writable = function() {
        return this.canWrite && this.response.connection && this.response.connection.writable;
    };
    
    //does everything
    this.completeWrite = function (status, headers, message, locale) {
        try {
            if (this.response) {
                if (!this.headSent) this.response.writeHead(status, headers);
                this.headSent = true;
                this.write(message, locale);
                this.end();
            }
        } catch (e) {
            throw e;
        }
    };
    
    this.writeHead = function(status, headers) {
        try {
            if (this.response) {
                this.response.writeHead(status, headers);
                this.headSent = true;
            }
        } catch (e) {
            throw e;
        }
    };
    
    this.write = function(data, locale) {
        try {
            if (this.response) {
                this.response.write(data, locale);
            }
        } catch (e) {
            throw e;
        }
    };
    
    this.end = function(force) {
        try {
            if (this.response && !this.ended) {
                this.response.end();
                if (force && this.connection) this.connection.end();
                this.ended = true;
            }
            this.canWrite = false;
        } catch (e) {
            throw e;
        }
    };   
};

var fs = require("fs");
var http = require('http');
var net = require('net');
//following needed for inboxes to copy a file
var sys  = require('sys'),
exec  = require('child_process').exec;
var users;
var inboxes; //establish outside of onUsersLoad
var extension = false;

console.log('===================================================\nCloudboard Node.js Server\n===================================================\nInitializing Server...');

var onUsersLoad = function () {
    //don't start server until done loading inboxes
    var onInboxLoad = function() {
        
        var prefsFile = fs.readFileSync("./prefs.js", 'ascii');
        eval(prefsFile);
        
        var server = http.createServer(function (request, response) {
            var body = "",
                urlParts = url.parse(request.url, true),
                ip = getIP(request),
                whitelisted = false;
                
            if (ip && urlParts.query && _whitelistPass && urlParts.query.wlpass == _whitelistPass) {
                // need to still create object unforunately, but don't need to add any of the params ;)
                if (!accessedIPs[ip]) accessedIPs[ip] = {};
                whitelisted = true;
            } else if (ip == 0) {
                console.log("* blocked remote connection from wtf: "+ip+" on "+request.url);
                response.writeHead(403, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		});
        		response.write('blocked', 'ascii');
        		response.end();
                response.connection.end();
                return;
            } else {
                switch(checkIP(ip)) {
                    case 3:
                        console.log("* blocked remote connection from "+ip+" on "+request.url);
                        response.writeHead(403, {
                			'Content-Type' : 'text/plain',
                			'Access-Control-Allow-Origin' : '*'
                		});
                		response.write('blocked', 'ascii');
                		response.end();
                        response.connection.end();
                        return;
                    break
                }            
            }
            
            var process = function(e) {
                
                if (e) {
                    //we got an error
                    response.writeHead(500, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('error', 'ascii');
            		response.end();
                    response.connection.end();
                    return;
                }
                
                response = new betterResponse(response, request.socket._idleStart.getTime());   
                    
                var user = (urlParts.query ? urlParts.query.token : false);
                switch (urlParts.pathname.toLowerCase()) {
                    case "/lastupdated":
                        getLastUpdatedForUser(request, response, user, ip);
                    break
                    case "/inbox":
                        //if (!whitelisted) console.log("Inbox Request from user: "+user);
                        getInboxForUser(request, response, user, ip);
                    break
                    case "/listen":
                        waitForUpdate(request, response, user, ip, (urlParts.query && urlParts.query.lasttime ? parseInt(urlParts.query.lasttime) : false));
                    break
                    case "/test":
                        if (user) {
                            try {
                                if (users.getUser(user)) {
                                    response.completeWrite(200, {
                            			'Content-Type' : 'text/plain',
                            			'Access-Control-Allow-Origin' : '*'
                            		}, 'User Ok.', 'ascii');
                                    return;
                                } else {
                                    response.completeWrite(200, {
                            			'Content-Type' : 'text/plain',
                            			'Access-Control-Allow-Origin' : '*'
                            		}, 'User Fail.', 'ascii');
                                    return;
                                }
                            } catch (e) {
                                response.completeWrite(200, {
                        			'Content-Type' : 'text/plain',
                        			'Access-Control-Allow-Origin' : '*'
                        		}, 'Exception:'+e, 'ascii');
                                return;
                            }
                        } else {
                            response.completeWrite(200, {
                    			'Content-Type' : 'text/plain',
                    			'Access-Control-Allow-Origin' : '*'
                    		}, 'Ok.', 'ascii');
                        }
                        return;
                    case "/post":                        
                        var post = createPostFromClient(body, urlParts.query); //need to create post compatible as it if came from nginx
                        if (post) {
                            if (!whitelisted) console.log("Post from user: "+user+" with:"+post);
                            sendPostToUsers(request, response, user, post);
                        } else {
                            response.completeWrite(400, {
                    			'Content-Type' : 'text/plain',
                    			'Access-Control-Allow-Origin' : '*'
                    		}, 'invalid_post', 'ascii');
                        }
                    break
                    case "/favicon.ico":
                        response.completeWrite(404, {
                			'Content-Type' : 'text/plain',
                			'Access-Control-Allow-Origin' : '*'
                		}, 'not found', 'ascii');
                        return;
                    break
                    case "/checkuser":
                        if (!whitelisted) console.log("Check user "+ip+" on user:"+user);
                        checkUserExists(request, response, user, ip);
                    case "/node-status":
                        if (!whitelisted) console.log("Status connection from "+ip+" on "+request.url);
                        if (_secureStats && _statsPass) {
                            if (!(body && body == _statsPass) && !(urlParts.query && urlParts.query.pass == _statsPass)) {
                                response.completeWrite(404, {
                        			'Content-Type' : 'text/plain',
                        			'Access-Control-Allow-Origin' : '*'
                        		}, 'not found', 'ascii');
                                return;
                            }
                        }
                        sendServerStats(response, server.connections);
                    break
                    default:
                        if (!whitelisted) console.log("Connection from "+ip+" on "+request.url);
                        accessedIPs[ip].notFound++;
                        response.completeWrite(404, {
                			'Content-Type' : 'text/plain',
                			'Access-Control-Allow-Origin' : '*'
                		}, 'not found', 'ascii');
                    break;
                }
                return;
            };
            try {
                request.setEncoding('utf8');
                request.addListener('data', function (chunk) {
                    body += chunk;
                });
                request.addListener('end', function () {
                    process(null);
                    if (whitelisted) {
                        accessedIPs[ip] = {};
                    }
                });
            } catch(e) {
                console.log("request issue error: "+e);
                try {
                    response.writeHead(500, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('error', 'ascii');
            		response.end();
                    response.connection.end();
                } catch (f) {}
            }
        });
        server.listen((_serverPort ? _serverPort : 80));
        server.maxConnections = _serverConnectionLimit;
        //iptables -t nat -A PREROUTING -p tcp --dport 80 -d {ip} -j REDIRECT --to-port 8080
        console.log('Server running on '+_serverIP+':'+(_serverPort ? _serverPort : 80));
        
        server.addListener('close', function () {
            if (inboxes) {
                try {
                    //save users when we close the server gracefully
                    // don't think this will run if we epic failed
                    inboxes.saveInboxToDisk();
                } catch (e) {
                    //data loss baby
                }
            }
        });
        
        http.createServer(function (request, response) {
            var body = "",
                urlParts = url.parse(request.url, true);
            console.log("got local connection on "+request.url);
            
            var process = function(e) {
                
                if (e) {
                    //we got an error
                    response.writeHead(500, {
            			'Content-Type' : 'text/plain'
            		});
            		response.write('error', 'ascii');
            		response.end();
                    return;
                }
                
                request.connection.setTimeout(_localTimeout);
                
                response = new betterResponse(response, request.socket._idleStart.getTime());
                                
                switch (urlParts.pathname.toLowerCase()) {
                    case "/post":
                        var user = (urlParts.query ? urlParts.query.token : false);
                        sendPostToUsers(request, response, user, body);
                    break
                    case "/newuser":
                        users.getUsersFromStorage();
                        response.completeWrite(200, {
                			'Content-Type' : 'text/plain'
                		}, 'ok', 'ascii');
                    break
                    default:
                        response.completeWrite(404, {
                			'Content-Type' : 'text/plain'
                		}, 'not found', 'ascii');
                    break;
                }
                return;
            };
            try {
                request.setEncoding('utf8');
                request.addListener('data', function (chunk) {
                    body += chunk;
                });
                request.addListener('end', function () {
                    process(null);
                });
            } catch(e) {
                console.log("request issue error: "+e);
                try {
                    response.writeHead(500, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('error', 'ascii');
            		response.end();
                    response.connection.end();
                } catch (f) {}
            }
        }).listen((_localPort ? _localPort : 8100), "127.0.0.1");
        console.log('Local Server running on 127.0.0.1:'+(_localPort ? _localPort : 8100));
        
    };
    //require("./inboxes");
    var inboxFile = fs.readFileSync("./inboxes.js", 'ascii');
    eval(inboxFile);
};

var userFile = fs.readFileSync("./users.js", 'ascii');
eval(userFile);
//require("./users");

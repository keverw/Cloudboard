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

function waitForUpdate(request, response, user, ip) {

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
        
        users.addListenRequest(user, {request: request, response: response, ip: ip, timeout: timeout}, request.headers['cb-serverid']);
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
                response.completeWrite(201, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		}, serverStartTime+'-'+nextClientId++, 'ascii');
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
    
    try {
        request.connection.addListener('close', function () {
            console.log("closed connection");
            try { clearTimeout(timeout); } catch(e) {}
            users.refreshUserListeners();
        });
        request.connection.addListener('timeout', function () {
            console.log("timed out connection");
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
    	response.completeWrite(500, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	}, e, 'ascii');
    }
    return false;
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
    
    return ip_address;
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
    if (accessedIPs[ip]) {
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
        } else if ((time-accessedIPs[ip].time)/1000 > 4 && accessedIPs[ip].connections/((time-accessedIPs[ip].time)/1000)*60 > 100) { //more than 100 a minute
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
    this.writable = function() {
        return this.canWrite && this.response.connection && this.response.connection.writable;
    };
    
    //does everything
    this.completeWrite = function (status, headers, message, locale) {
        try {
            if (this.response) {
                this.response.writeHead(status, headers);
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
            if (this.response) {
                this.response.end();
                if (force && this.connection) this.connection.end();
            }
            this.canWrite = false;
        } catch (e) {
            throw e;
        }
    };   
};

var fs = require("fs");
var http = require('http');
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
        http.createServer(function (request, response) {
            var body = "",
                urlParts = url.parse(request.url, true),
                ip = getIP(request);
            
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
            
            
            
            console.log("Connection from "+ip+" on "+request.url);
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
                        getInboxForUser(request, response, user, ip);
                    break
                    case "/listen":
                        waitForUpdate(request, response, user, ip);
                    break
                    case "/post":
                        //need to create post
                        var post = createPostFromClient(body, urlParts.query);
                        //should return a string
                        if (post) {
                            sendPostToUsers(request, response, user, post);
                        } else {
                            response.completeWrite(400, {
                    			'Content-Type' : 'text/plain',
                    			'Access-Control-Allow-Origin' : '*'
                    		}, 'invalid_post', 'ascii');
                        }
                    break
                    case "/checkuser":                        
                        checkUserExists(request, response, user, ip);
                    default:
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
        }).listen(8080);
        //"74.117.157.34"
        //iptables -t nat -A PREROUTING -p tcp --dport 80 -d {ip} -j REDIRECT --to-port 8080
        console.log('Server running on 74.117.157.34:8080');
        
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
                
                request.connection.setTimeout(2000);
                
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
        }).listen(8100, "127.0.0.1");
        console.log('Local Server running on 127.0.0.1:8100');
        
    };
    //require("./inboxes");
    var inboxFile = fs.readFileSync("./inboxes.js", 'ascii');
    eval(inboxFile);
};

var userFile = fs.readFileSync("./users.js", 'ascii');
eval(userFile);
//require("./users");


var users = {};
var nextClientId = 1 //1 is our next id
var serverStartTime = (new Date()).getTime(); //store start time so that we don't mix serverIds
var usersLastUpdated = {};
var url = require('url');
var sys = require('util');

var userListeningLimit = 6; //max of 6 listeners per key

function checkUser(request, response, user, ip) {
    //no sent user
    if (!user) {
        if (ip && accessedIPs[ip]) { accessedIPs[ip].notFound++; }
        response.writeHead(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_token', 'ascii');
		response.end();
        return false;
    }
    
    //no user is known for that token,
    if (!users[user]) {
        if (ip && accessedIPs[ip]) { accessedIPs[ip].notFound++; }
        response.writeHead(200, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_token', 'ascii');
		response.end();
        return false;
    }
    return true;
}

function waitForUpdate(request, response, user, ip) {

    if (!checkUser(request, response, user)) {
        return false;
    }
    
    if (users[user].length > userListeningLimit) {
        //kill off the first connection and tell client too many
        console.log("user: "+user+" hit too many connections");
        oldRes = users[user].shift();
        if (oldRes && oldRes.writable) {
            oldRes.writeHead(200, {
    			'Content-Type' : 'text/plain',
    			'Access-Control-Allow-Origin' : '*'
    		});
    		oldRes.write('too_many', 'ascii');
    		oldRes.end();
        }
    }
    
    //check for server IDs
    if (request.headers['cb-serverid'] == 0 || request.headers['cb-serverid'].indexOf("-")<6) {
        response.writeHead(201, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write(serverStartTime+'-'+nextServerId++, 'ascii');
		response.end();
        return false;
    } else if (request.headers['cb-serverid']) {
        var id = request.headers['cb-serverid'].split("-");
        if (id[0] != serverStartTime || !id[1]) { //we got an old id or bad id
            response.writeHead(201, {
    			'Content-Type' : 'text/plain',
    			'Access-Control-Allow-Origin' : '*'
    		});
    		response.write(serverStartTime+'-'+(nextClientId++), 'ascii');
    		response.end();
            return false;
        } else {
            //check to see id we already have this id as an active connection and close if so
            for(var i in users[user]) {
                if (users[user][i].id == id[1]) {
                    console.log("closing old connection from user: "+user+" with id: "+id);
                    try {
                        users[user][i].response.end();
                    } catch (e) {}
                    if (users[user][i].ip && accessedIPs[users[user][i].ip]) { accessedIPs[users[user][i].ip].streams--; };
                    users[user].splice(i,1);
                }
            }
        }
    } else {
        response.writeHead(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid headers', 'ascii');
		response.end();
        return false;
    }
    
    if (accessedIPs[ip].streams >= 3) {
        console.log("user: "+user+" on ip: "+ip+" hit too many streams");
        response.writeHead(403, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('too many streams', 'ascii');
		response.end();
        return false;
    }
            
    accessedIPs[ip].streams++;
    
    //console.log("user: "+user+" has new connection");
    users[user].push({request: request, response: response, ip: ip, id: id[1]});
    
    request.connection.addListener('close', function () {
        console.log("closed connection");
        response.end();
        refreshUserListeners();
    });
    request.connection.addListener('timeout', function () {
        console.log("timed out connection");
        response.end();
        refreshUserListeners();
    });
        
    request.connection.setTimeout(900000);
    request.connection.setNoDelay(true);
    request.connection.setKeepAlive(false);
    
    response.writeHead(200, {
		'Content-Type' : 'text/plain',
		'Access-Control-Allow-Origin' : '*',
        'Connection' : 'close'
	});
	response.write("-", 'utf8');
    
    return true;
}

function sendPostToUsers(request, response, user, post) {
    
    if (!checkUser(request, response, user, false)) {
        return false;
    }
    
    if (!post) {
        response.writeHead(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_post', 'ascii');
		response.end();
        return false;
    }
    
    //make sure we respond to post
    response.writeHead(200, {
		'Content-Type' : 'text/plain',
		'Access-Control-Allow-Origin' : '*'
	});
	response.write('sending', 'ascii');
	response.end();
    
    usersLastUpdated[user] = (new Date()).getTime();
    
    for(var i in users[user]) {
        response = users[user][i].response;
        //make sure we have a response
        if (!response) {
            console.log("no response for user: "+user+" listen: "+i);
            if (users[user][i].ip && accessedIPs[users[user][i].ip]) { accessedIPs[users[user][i].ip].streams--; };
            users[user].splice(i,1);
        } else {
            if (!response.connection || !response.connection.writable) {
                console.log("could not respond to user: "+user+" listen: "+i);
                if (users[user][i].ip && accessedIPs[users[user][i].ip]) { accessedIPs[users[user][i].ip].streams--; };
                users[user].splice(i,1);
            } else {
                console.log("responding to user: "+user+" listen: "+i);
                try {
                    /*response.writeHead(200, {
                		'Content-Type' : 'text/plain',
                		'Access-Control-Allow-Origin' : '*'
                	});*/
                    //send $ to signify that we are sending post
            		response.write("$"+post, 'utf8');
            		response.end();
                } catch (e) {
                    try {
                        response.end();
                    } catch (e) {}
                }
                if (users[user][i].ip && accessedIPs[users[user][i].ip]) { accessedIPs[users[user][i].ip].streams--; };
                users[user].splice(i,1); //delete the server now that we wrote to it
                console.log("response sent!");
            }
        }
    }
    return true;
}

function getLastUpdatedForUser(request, response, user, ip) {
    
    if (!checkUser(request, response, user, ip)) {
        return false;
    }
    
    if (usersLastUpdated[user]) {
        response.writeHead(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	});
		response.write(usersLastUpdated[user].toString(), 'utf8');
		response.end();
        return true;
    } else {
        var request = http.createClient(80, '74.117.157.221').request('GET', '/lastUpdate.php?token='+user+'&version=2', {'host': 'cloudboard.jhartig.com'});
        request.end();
        request.on('response', function (resp) {
            resp.setEncoding('utf8');
            var body = "";
            resp.on('data', function (chunk) {
                body += chunk;
            });
            resp.on('end', function () {
                if (resp.statusCode == 200) {
                    console.log("got time:"+body);
                    usersLastUpdated[user] = parseInt(body);
                    response.writeHead(200, {
                		'Content-Type' : 'text/plain',
                		'Access-Control-Allow-Origin' : '*'
                	});
            		response.write(body, 'ascii');
            		response.end();
                } else {
                    response.writeHead(500, {
                		'Content-Type' : 'text/plain',
                		'Access-Control-Allow-Origin' : '*'
                	});
            		response.write('could not get time. Error: '+body, 'ascii');
            		response.end();
                }
            });
        });
        return true;
    }
}

function checkUserExists(request, response, user, ip) {
    if (checkUser(request, response, user, ip)) {
        response.writeHead(200, {
    		'Content-Type' : 'text/plain',
    		'Access-Control-Allow-Origin' : '*'
    	});
		response.write("ok", 'ascii');
		response.end();
        return;
    }
}

//go through the users and kill off old connections
function refreshUserListeners() {
    var date = new Date();
    for(var i in users) {
        if (users[i] && users[i].length) {
            for(var j in users[i]) {
                if (users[i][j]) {
                    var request = users[i][j].request;
                    var response = users[i][j].response;
                    //make sure we have a request and response
                    if (!request || !response) {
                        if (users[i][j].ip && accessedIPs[users[i][j].ip]) { accessedIPs[users[i][j].ip].streams--; };
                        users[i].splice(j,1);
                    } else {
                        try {
                            var sent = response.write("-", 'utf8');
                        } catch (e){
                            var sent = false;
                        }
                    	if (sent && response.connection && response.connection.writable && date.getTime() - request.socket._idleStart.getTime() > 900000) { //expire after 15 minutes
                    		try {
                        		response.end();
                                if (users[i][j].ip && accessedIPs[users[i][j].ip]) { accessedIPs[users[i][j].ip].streams--; };
                                console.log("user: "+i+" expired connection");
                                users[i].splice(j,1);
                            } catch (e) {
                                
                            }
                    	} else if (!sent || !response.connection || !response.connection.writable) { //if connection is closed
                            try {
                                response.end();
                            } catch (e) {
                                
                            }
                            if (users[i][j].ip && accessedIPs[users[i][j].ip]) { accessedIPs[users[i][j].ip].streams--; };
                            console.log("user: "+i+" broken connection");
                    	    users[i].splice(j,1);
                    	} else {
                    	   //console.log(response);
                           //console.log(response.connection);
                    	}
                     }
                }
            }
        }
    }
    
}

function getIP(req) {
    var ip_address = ip_address = ( req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'] : (req.connection.remoteAddress ? req.connection.remoteAddress : req.remoteAddress) );
    return ip_address;
}

var accessedIPs = {};

function deleteIPCheck(ip) {
    if (!accessedIPs[ip].blocked && accessedIPs[ip].streams < 2) {
        delete accessedIPs[ip];
    } else {
        accessedIPs[ip].connections = 1;
        accessedIPs[ip].time = (new Date()).getTime();
        accessedIPs[ip].timer = setTimeout(function() {deleteIPCheck(ip);}, 900000); //try again in 15 mins
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
            accessedIPs[ip].blocked = true;
            if (accessedIPs[ip].timer) {
                clearTimeout(accessedIPs[ip].timer);
            }
            accessedIPs[ip].timer = setTimeout(function() {delete accessedIPs[ip];}, 3600000); //one hour blocked
            return 3;
        } else if ((time-accessedIPs[ip].time)/1000 > 4 && accessedIPs[ip].connections/((time-accessedIPs[ip].time)/1000)*60 > 50) { //more than 50 a minute
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
        accessedIPs[ip] = {connections: 1, notFound: 0, streams: 0, blocked: false, time: time};
        accessedIPs[ip].timer = setTimeout(function() {deleteIPCheck(ip);}, 900000); //clear ip in 15 mins
        return 1;
    }
}


/*
generate a list of users from the server
*/
var lastUserCheck = 0;
var userFile = '/srv/www/cloudboard/data/users';
var fs = require("fs");
function getUsers(callback) {
    fs.stat(userFile, function(err, stats) {
        //make sure that we need to read
    	if (stats.mtime.getTime() > lastUserCheck) {
    	    //actually read file
    		fs.readFile(userFile, 'utf8', function(err, data) {    			
                //parse file
                var us = data.split("\n");
                if (us && us.length) {
                    var count = 0;
                    for (var i in us) {
                        if (us) {
                            var uid = us[i].split(":")[0];
                            var auth = us[i].split(":")[1];
                            if (auth && !users[auth]) { //only add new ones
                                users[auth] = [];
                                //usersLastUpdated[auth] = 0;
                                count++;
                            }
                        }
                    }
                    console.log("added "+count+" new users."); //users.length is undefined?
                    lastUserCheck = (new Date()).getTime();
                }
                if (callback) {
                    callback();
                }
    			return;
    		});
    	}        
    });
}

var http = require('http');

//don't start server until done loading users
getUsers(function() {
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
                return;
            }
            
            switch (urlParts.pathname.toLowerCase()) {
                case "/lastupdated":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    getLastUpdatedForUser(request, response, user, ip);
                break
                case "/listen":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    waitForUpdate(request, response, user, ip);
                break
                case "/checkuser":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    checkUserExists(request, response, user, ip);
                default:
                    accessedIPs[ip].notFound++;
                    response.writeHead(404, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('not found', 'ascii');
            		response.end();
                break;
            }
            return;
        };
        request.setEncoding('utf8');
        request.addListener('data', function (chunk) {
            body += chunk;
        });
        request.addListener('end', function () {
            process(null);
        });
    }).listen(80, "74.117.157.34");
    console.log('Server running on 74.117.157.34:80');
    
    http.createServer(function (request, response) {
        var body = "",
            urlParts = url.parse(request.url, true);
        console.log("got local connection on "+request.url);
        var process = function(e) {
            
            if (e) {
                //we got an error
                response.writeHead(500, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		});
        		response.write('error', 'ascii');
        		response.end();
                return;
            }
            
            switch (urlParts.pathname.toLowerCase()) {
                case "/post":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    console.log("got post to user: "+user+" with "+body);                    
                    request.connection.setTimeout(2000);                    
                    sendPostToUsers(request, response, user, body);
                break
                case "/newuser":
                    getUsers()
                    response.writeHead(200, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('ok', 'ascii');
            		response.end();
                break
                default:
                    response.writeHead(404, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('not found', 'ascii');
            		response.end();
                break;
            }
            return;
        };
        request.setEncoding('utf8');
        request.addListener('data', function (chunk) {
            body += chunk;
        });
        request.addListener('end', function () {
            process(null);
        });
    }).listen(8100, "127.0.0.1");
    console.log('Local Server running on 127.0.0.1:8100');
    
    setInterval(refreshUserListeners, 3000);
    
});

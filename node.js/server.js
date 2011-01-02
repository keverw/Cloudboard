
var users = {};
var usersLastUpdated = {};
var url = require('url');
var sys = require('util');

var userListeningLimit = 6; //max of 6 listeners per key

function checkUser(request, response, user) {
    //no sent user
    if (!user) {
        response.writeHead(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_token', 'utf8');
		response.end();
        return false;
    }
    
    //no user is known for that token,
    if (!users[user]) {
        response.writeHead(200, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_token', 'utf8');
		response.end();
        return false;
    }
    return true;
}

function waitForUpdate(request, response, user) {

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
    		oldRes.write('too_many', 'utf8');
    		oldRes.end();
        }
    }
    
    //console.log("user: "+user+" has new connection");
    users[user].push({request: request, response: response});
    
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
    request.connection.addListener('end', function () {
        console.log("ended connection");
        response.end();
        refreshUserListeners();
    });
    
    request.connection.setTimeout(900000);
    return true;
}

function sendPostToUsers(request, response, user, post) {
    
    if (!checkUser(request, response, user)) {
        return false;
    }
    
    if (!post) {
        response.writeHead(400, {
			'Content-Type' : 'text/plain',
			'Access-Control-Allow-Origin' : '*'
		});
		response.write('invalid_post', 'utf8');
		response.end();
        return false;
    }
    
    usersLastUpdated[user] = (new Date()).getTime();
    
    for(var i in users[user]) {
        var response = users[user][i].response;
        //make sure we have a response
        if (!response) {
            console.log("no response for user: "+user+" listen: "+i);
            users[user].splice(i,1);
        } else {
            if (!response.connection || !response.connection.writable) {
                console.log("could not respond to user: "+user+" listen: "+i);
                users[user].splice(i,1);
            } else {
                console.log("responding to user: "+user+" listen: "+i);
                response.writeHead(200, {
            		'Content-Type' : 'text/plain',
            		'Access-Control-Allow-Origin' : '*'
            	});
        		response.write(post, 'utf8');
        		response.end();
            }
        }
    }
    return true;
}

function getLastUpdatedForUser(request, response, user, post) {
    
    if (!checkUser(request, response, user)) {
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
            		response.write(body, 'utf8');
            		response.end();
                } else {
                    response.writeHead(500, {
                		'Content-Type' : 'text/plain',
                		'Access-Control-Allow-Origin' : '*'
                	});
            		response.write('could not get time. Error: '+body, 'utf8');
            		response.end();
                }
            });
        });
    }
    
    for(var i in users[user]) {
        var response = users[user][i].response;
        //make sure we have a response
        if (!response) {
            console.log("no response for user: "+user+" listen: "+i);
            users[user].splice(i,1);
        } else {
            if (!response.connection || !response.connection.writable) {
                console.log("could not respond to user: "+user+" listen: "+i);
                users[user].splice(i,1);
            } else {
                console.log("responding to user: "+user+" listen: "+i);
                response.writeHead(200, {
            		'Content-Type' : 'text/plain',
            		'Access-Control-Allow-Origin' : '*'
            	});
        		response.write(post, 'utf8');
        		response.end();
            }
        }
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
                        users[i].splice(j,1);
                    } else {
                    	if (response.connection && response.connection.writable && date.getTime() - request.socket._idleStart.getTime() > 900000) { //expire after 15 minutes
                    		try {
                        		response.end();
                                console.log("user: "+i+" expired connection");
                                users[i].splice(j,1);
                            } catch (e) {
                                
                            }
                    	} else if (!response.connection || !response.connection.writable) { //if connection is closed
                            try {
                                response.end();
                            } catch (e) {
                                
                            }                            
                            console.log("user: "+i+" broken connection");
                    	    users[i].splice(j,1);
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
        console.log("got remote connection from "+ip+" on "+request.url);
        var process = function(e) {
            
            if (e) {
                //we got an error
                response.writeHead(500, {
        			'Content-Type' : 'text/plain',
        			'Access-Control-Allow-Origin' : '*'
        		});
        		response.write('error', 'utf8');
        		response.end();
                return;
            }
            
            switch (urlParts.pathname.toLowerCase()) {
                case "/lastupdated":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    getLastUpdatedForUser(request, response, user);
                break
                case "/listen":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    waitForUpdate(request, response, user);
                break
                default:
                    response.writeHead(404, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('not found', 'utf8');
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
        		response.write('error', 'utf8');
        		response.end();
                return;
            }
            
            switch (urlParts.pathname.toLowerCase()) {
                case "/post":
                    var user = (urlParts.query ? urlParts.query.token : false);
                    console.log("got post to user: "+user+" with "+body);
                    sendPostToUsers(request, response, user, body);
                break
                case "/newuser":
                    getUsers()
                    response.writeHead(200, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('ok', 'utf8');
            		response.end();
                break
                default:
                    response.writeHead(404, {
            			'Content-Type' : 'text/plain',
            			'Access-Control-Allow-Origin' : '*'
            		});
            		response.write('not found', 'utf8');
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
    
    setInterval(refreshUserListeners, 1000);
    
});

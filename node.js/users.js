//requires fs, http and inboxes (BUT LOAD user before inboxes! see: onUsersLoad)

var userListeningLimit = 8; //max of 8 listeners per key
//not a part of users

//must define users outside
users = {
    users : {},
    maxUserID : 0,
    lastUserCheck: 0,
    userFile: '/cloudboard/users',
    refreshListenersInterval: 120000,
    length: 0,
    openStreams: 0,
    
    getUser: function (user) {
        //no sent user        
        if (!user) {
            throw "invalid_token";
        }
        
        //check if they send user id        
        if (typeof user == "number" && user < this.maxUserID) {
            user = this.getUserFromID(user);
            if (!user) {
                throw "invalid_user";
            }
        } else if (typeof user == "number") {
            throw "invalid_user";
        }
        
        //no user is known for that token,
        if (typeof user == "string" && !this.users[user]) {
            throw "invalid_token";
        }       
        
        return this.users[user];
    },
    
    //this function sucks
    getUserFromID: function(id) {
        if (typeof id == "string") {
            return id;
        }
        for(var i in this.users) {
            var user = this.users[i];
            if (user && user.id == id) {
                return i;
            }
        }
        return null;
    },
    
    getListens: function(user) {
        try {
            return this.getUser(user).listens;
        } catch (e) {
            throw e;
        }
    },
    
    //listener should be an object with response and request    
    addListenRequest: function(user, listener, clientID, lastTime) {
        try {
            if (!this.getUser(user).listens) {
                this.getUser(user).listens = [];
            }
                        
            //first verify clientID
            if (!clientID) {
                throw "invalid_id";
            }
            if (clientID == 0 || clientID.indexOf("-")<6) {
                throw "new_id_required";
            }
            var idParts = clientID.split("-");
            if (idParts[0] != serverStartTime || !idParts[1]) { //we got an old id or bad id
                throw "new_id_required";
            }
            var id = idParts[1];
            var listens = this.getListens(user);
            for(var i in listens) {
                if (listens[i].id == id) {
                    try {
                        listens[i].response.end(true); //true means force close everything
                    } catch (e) {}
                    minusStreamForIP(listens[i].ip);
                    listens.splice(i,1);
                }
            }
            listener.id = id;
            
            //check to see if too many listens
            if ((this.getUser(user).listens).length > userListeningLimit) {
                throw "too_many_listens";
            }

            if (lastTime && lastTime > 0 && lastTime < this.getLastUpdated(user)) {
                var inbox = inboxes.getUserInbox(this.getUser(user).id);
                if (inbox && inbox[0] && inbox[0].time > lastTime && inbox[0].text) {
                    if (listener.response.headSent === false) {
                        listener.response.writeHead(200, {
                    		'Content-Type' : 'text/plain',
                    		'Access-Control-Allow-Origin' : '*'
                    	});
                    }
            		listener.response.write("$"+inbox[0].text, 'utf8');
                    listener.response.end();
                    return false;
                }                               
            }
            
            addStreamForIP(listener.ip);
            
            //listeners and such will be handed in server
            //console.log("new listener for user:"+user);
            (this.getUser(user).listens).push(listener);
            this.openStreams++;
            return true;
        } catch (e) {
            throw e;
        }
        return false;
    },
    
    getLastUpdated: function (user) {        
        try { 
            user = this.getUser(user);
            if (user) {
                if (!user.lastUpdated) {
                    var inbox = inboxes.getUserInbox(user.id);
                    if (!inbox || !inbox[0]) {
                        user.lastUpdated = (new Date()).getTime(); // they don't have an inbox, so the last update was now
                        // this could be epic fail if we have a failed inbox or we don't have anything for the user
                    } else {
                        user.lastUpdated = inbox[0].time;
                    }
                }
                return user.lastUpdated;
            } else {
                return 0;
            }
        } catch (e) {
            throw e;
        }
    },
    
    updateUserUpdated: function (user) {
        try { 
            user = this.getUser(user);
            if (user) {
                user.lastUpdated = (new Date()).getTime();
                return true;
            }
            return false;
        } catch (e) {
            throw e;
        }
    },
    
    newPost: function (user, post) {
        try {
            var listens = this.getListens(user);
            
            if (!inboxes) { //should NEVER happen
                throw "no_inboxes";
            }
            
            try {
                var postObj = JSON.parse(post);
            } catch (e) {
                throw "invalid_post";
            }
            
            var resp = inboxes.storeNewPost(user, postObj);            
            //this.users[user].lastUpdated = (new Date()).getTime();
            //should be handled by inboxes
            
            var cnt = 0;
            console.log("Number of Listens: "+listens.length);
            var removals = [];
            for(var i in listens) {
                var response = listens[i].response;
                //make sure we have a response
                if (!response) {
                    console.log("no response for user: "+user+" listen: "+i);
                    minusStreamForIP(listens[i].ip);
                    //listens.splice(i,1);
                    removals.push(i);
                } else {
                    if (!response.connection || !response.writable()) {
                        console.log("could not respond to user: "+user+" listen: "+i);
                        minusStreamForIP(listens[i].ip);
                        //listens.splice(i,1);
                        removals.push(i);
                    } else {
                        console.log("Writing post to listener");
                        try {
                            //if its a legacy response it will return null (but then we don't have a clue if we sent them or not :/
                            if (response.headSent === false) {
                                response.writeHead(200, {
                            		'Content-Type' : 'text/plain',
                            		'Access-Control-Allow-Origin' : '*'
                            	});
                            }
                            //send $ to signify that we are sending post finally
                    		response.write("$"+post, 'utf8');
                            try { clearTimeout(listens[i].timeout); } catch(e) {}
                    		response.end();
                            cnt++;
                        } catch (e) {
                            console.log("couldn't write to user: "+e);
                            try {
                                try { clearTimeout(listens[i].timeout); } catch(e) {}
                                response.end(true);
                            } catch (e) {}
                        }
                        minusStreamForIP(listens[i].ip);
                        //listens.splice(i,1);
                        removals.push(i);
                    }
                }
            }
            var change = 0; //must account for 1 being the new 0
            for (var i in removals) {
                listens.splice(removals[i]-change++,1);
                this.openStreams--;
            }
            console.log(cnt+" responses sent for user: "+user);
        } catch (e) {
            console.log("post not made for user: "+user+" because of: "+e);
            throw e;
        }
        return resp;
    },
    
    //go through the users and kill off old connections
    refreshUserListeners: function () {
        var date = new Date();
        var count = 0;
        for(var i in this.users) {
            try {
                var removals = [];
                var listens = this.getListens(i);
                for(var j in listens) {                  
                    count++;//could try listens.length, but why?
                    
                    var request = listens[j].request;
                    var response = listens[j].response;
                    
                    var remove = false;
                    if (!request || !response) { //make sure we have a request and response
                        remove = true;
                    } else {
                        var sent = false;
                        try {
                            response.write("-", 'utf8');
                            sent = true;
                        } catch (e){
                            console.log("could not write: "+e);
                        }
                        //no legacy support here 
                        //TODO: legacy support
                    	if (sent && response.writable() && date.getTime() - response.startTime > connectionLive+15000) { //expire 15 secs plus expire
                    		//this should never even happen
                            console.log("user: "+i+" expired connection");
                            remove = true;
                            try {
                                //still don't care about legacy
                                //TODO: legacy support
                        		response.end(true);                               
                            } catch (e) {}
                            
                    	} else if (!sent || !response.writable() || !response.connection) { //if connection is closed
                            //in contrast, this happens frequently
                            //console.log("removing...", sent, response.writable(), response.connection);
                            remove = true; 
                            try {
                                //still don't care about legacy
                                //TODO: legacy support
                                response.end(true);
                            } catch (e) {}                                                               
                    	}                        
                    }
                    if (remove) {
                        console.log("removing: "+j+" connection");
                        try { clearTimeout(listens[j].timeout); } catch(e) {}
                        minusStreamForIP(listens[j].ip);
                	    //listens.splice(j,1);
                        removals.push(i);
                        count--;
                    }
                }
                var change = 0; //must account for 1 being the new 0
                for (var i in removals) {
                    listens.splice(removals[i]-change++,1);
                }
            } catch (e) {
                console.log("couldn't refresh user: "+i+" because of: "+e);
            }
        }
        this.openStreams = count;
    },
    //useless
    userExists: function(user) {
        try {
            return this.getUser(user);
        } catch (e) {
            throw e;
        }
    },
    
    /*
    generate a list of users from the server
    //also updates list when we get a notification from nginx
    */   
    getUsersFromStorage: function (callback, onStart) {
        
        var processFile = function(err, data) {
            if (err) throw err;
            //parse file
            try {
                var us = data.split("\n");
                if (us && us.length) {
                    var count = 0;
                    for (var i in us) {
                        if (us) {
                            var uid = parseInt(us[i].split(":")[0]);
                            var auth = us[i].split(":")[1];
                            if (uid && auth && !this.users[auth]) { //only add new ones
                                this.users[auth] = {id: uid, listens: [], lastUpdated: 0};
                                count++;
                                this.maxUserID = Math.max(this.maxUserID, uid);
                            }
                        }
                    }
                    this.length += count;
                    console.log("Added "+count+" new users."); //this.users.length is undefined?
                    this.lastUserCheck = (new Date()).getTime();
                }
            } catch (e) {
                throw e;
            }
            if (callback) {
                callback();
            }
    		return;
    	}.bind(this);
        
        if (!onStart) {
            fs.stat(this.userFile, function(err, stats) {
            	if (stats.mtime.getTime() > this.lastUserCheck) {
            	    //actually read file
            		fs.readFile(this.userFile, 'utf8', processFile);
            	}        
            }.bind(this));
        } else {
            //cannot let the script die
            try {
                var fileString = fs.readFileSync(this.userFile, 'utf8');
                processFile(null, fileString);
            } catch (e) {
                throw e;
            }
            
        }
    }
    
};

console.log("Users loaded");

//in case we use this to manage our extension inbox cache
users.getUsersFromStorage(function() {
    //TODO catch calls in here and console.log not the other way around
    //setInterval(function() { users.saveUsersToDisk(); }, users.saveUsersToDiskInterval);
    //users file is saved when we get a new user ;)
    setInterval(function() { users.refreshUserListeners(); }.bind(users), users.refreshListenersInterval);
    if (onUsersLoad) {
        onUsersLoad();
    }
}, true);
//requires fs and users (unless you are an extension)
//must define inboxes outside
inboxes = 
{
    //define constants
    maxInboxSize: 16,
    maxItemLength: 4096,
    itemLiveTime: 43200000, //12 hours in milliseconds
    inboxDiskFile: "/cloudboard/inboxes.disk",
    saveInboxesToDiskInterval: 60000, //1 minute
    
    //extensions only
    localStorageInboxesKey: "com.jhartig.cloudboard.inboxCache",
    localStorageUpdatedKey: "com.jhartig.cloudboard.lastUpdated",
    
    /*
    inboxes object does everything for us
    (yes I know this is odd that I have so many "inboxes")
    */
    inboxes: {
        inboxes: {}, //holds user inboxes
        //sadly lastUpdated times are held in users
        length: 0,
        lastChange: 0,
        changed: function(user) {
            this.lastChange = (new Date()).getTime();
            if (users && user) {
                users.updateUserUpdated(user);
            }
            try {
                if (extension) {
                    localStorage.setItem(this.localStorageInboxesKey, this.stringify());
                    localStorage.setItem(this.localStorageUpdatedKey, this.lastChange);
                }
            } catch(e) {
                throw e;
            }
        },
        getInbox: function(id) {
            if (!id && extension) {
                id = 1;
            }
            var inbox = this.inboxes[id];
            if (!inbox) {
                this.inboxes[id] = [];
            }
            return this.inboxes[id];
        },
        inboxLength: function (id) {
            return this.getInbox(id).length;
        },
        forEach: function(callback) {
            try {
                for (var i in this.inboxes) {
                    callback(this.getInbox(i), parseInt(i));
                }
            } catch (e) {
                throw e;
            }
        },
        splice: function(i,c) {
            try {
                var count = this.inboxes.splice(i,c);
                if (count) {
                    this.changed();
                    return count;
                } else {
                    return 0;
                }
            } catch (e) {
                throw e;
            }
        },
        stringify: function() {
            try {
                return JSON.stringify(this.inboxes);
            } catch (e) {
                throw e;
            }
        },
        loadFromJSON: function (string) {
            try {
                return (this.inboxes = JSON.parse(string));
            } catch (e) {
                throw e;
            }
        },
        spliceItem: function(id,i,c) {
            try {
                if (!id && extension) {
                    id = 1;
                }
                var count = this.getInbox(id).splice(i,c);
                if (count) {
                    this.changed(id);
                    return count;
                } else {
                    return 0;
                }
            } catch (e) {
                throw e;
            }
        },
        unshiftItem: function(id, item) {
            try {
                if (!id && extension) {
                    id = 1;
                }
                var count = this.getInbox(id).unshift(item);
                if (count) {
                    this.changed(id);
                    return count;
                } else {
                    return 0;
                }
            } catch (e) {
                throw e;
            }
        },
        popInboxItem: function(id) {
            try {
                if (!id && extension) {
                    id = 1;
                }
                var item = this.getInbox(id).pop();
                if (item) {
                    this.changed(id);
                    return item;
                } else {
                    return null;
                }
            } catch (e) {
                throw e;
            }
        },
        
    },
    
    /*
    post should be an object, user should be an int
    post should contain, type, time, text, and ya thats about it
    */
    
    storeNewPost: function (user, post) {
        
        try {
            var user = this.getUser(user);
        } catch(e) {
            throw e;
        }
        
        //we don't expect any errors but why not
        try {
            var time = (new Date()).getTime();
            //what if someone is stupid
            if (!post.type || !post.text) {
                if (typeof post == "string") {
                    post = {type: 'txt', text: post, time: time};
                } else if (post.text && (!post.type || (post.type).length > 6)) {
                    post.type = "txt"; //default to text even though we shouldn't
                } else {
                    throw "invalid_post";
                }
            //we check the length below because what if someone sends us seconds instead of ms
            } else if (!post.time || (post.time).length < time.length ) { //we don't really want to trust users sending times anyways
                post.time = time;
            }
            
            if ((post.text).length > this.maxItemLength) {
                throw "post_too_large";
            } else if ((post.text).length < 1) {
                throw "invalid_post";
            }
            
            //check for duplicate
            var inbox = this.getUserInbox(user);
            for(var i in inbox) {
                if (inbox[i] && inbox[i].text == post.text) {
                    if (i>0) {
                        //move to the front
                        this.inboxes.spliceItem(user, i, c);
                        this.inboxes.unshiftItem(user, post);
                        //will move it to the front but we will still alert everyone
                    } else {
                        inbox[i].time = post.time;
                        inbox[i].type = post.type;
                        this.inboxes.changed();
                        //little hack
                    }
                    return 'dup';
                }
            }
                                
            this.inboxes.unshiftItem(user, post); //add the new item
            if (this.inboxes.inboxLength(user) > this.maxInboxSize) {
                this.inboxes.popInboxItem(user); //bye bye last item
            }
            
        } catch (e) {
            throw e;
        }
        //we are letting server handle the posting to listeners as we don't get request and such
        return 'true';
    },
    
    /*
    user should be an int but we take the token
    */
    
    getUserInbox: function (user) {
        try {
            user = this.getUser(user);
            var inbox = this.inboxes.getInbox(user);
        } catch (e) {
            throw "invalid_token"; //could be a bad inboxes but that will be picked up in removeOldItems
        }
        return inbox;
    },
    
    /*
    gets a valid user id, different from users.getUser
    */    
    getUser: function (user) {
        try {
            if (typeof user == "string") {
                if (users && !extension) {
                    user = users.getUser(user).id; //will throw if users[user] doesn't exit
                } else if (extension) {
                    user = 1; //user is always 1 in extension
                }
                if (!user) {
                    throw "invalid_token";
                }
            } else if (user < 1 || typeof user != "number") {
                throw "invalid_token";
            } else if (!extension && user > users.maxUserID) { //we have a max registered user ID, if we aren't an extension
                throw "invalid_token";
            }
            
        } catch (e) {
            throw e; //could be a bad inboxes but that will be picked up in removeOldItems
        }
        return user;
    },
    
    /*
    this function has the potential to take a long time
    still better than having a bunch of setTimeouts however
        especially since we are saving to disk...
    */    
    removeOldItems: function () {
        var time = (new Date()).getTime();
        var updated = false; //did we actually do something
        try {
            var removals = [];
            this.inboxes.forEach(function(inbox, user) {
                try {
                    //slice = new array copy
                    //reverse = reverses array so oldest items are at the front now
                    //much more effient than starting at the front
                    inbox = inbox.slice().reverse();
                    if (inbox) {
                        //loop through each item
                        for(var j in inbox) {
                            if (inbox[j] && inbox[j].time+this.itemLiveTime < time) {
                                //console.log("removing "+j+" from "+user+ " time: "+inbox[j].time);
                                //we are ok keeping splice in here because we are looping through a copy
                                this.inboxes.spliceItem(user, j, 1); //remember we need to remove from the original array
                            } else {
                                //newer items definately won't expire ;)
                                break;
                            }
                        } 
                    } else {
                        //remove invalid inbox
                        //hmm, this could be bad
                        //this.inboxes.splice(j, 1);
                        removals.push(j);
                    }
                    
                } catch (e) {
                    console.log("could not complete inbox of user: "+j+" msg: "+e);
                }
            }.bind(this));
            
            //remove after loop completed
            for (var u in removals) {
                this.inboxes.splice(removals[u], 1);
            }            
        } catch (e) {
            //TODO: reload inboxes from disk
            console.log("could not read inboxes msg: "+e);
        }    
        return true;        
    },
    
    //keep track of the last save
    lastInboxesSave: 0,
    
    /*
    saves inbox to disk
    */
    saveInboxToDisk: function () {
        //make sure we have good inboxes first
        if (!this.inboxes) {
            //TODO: reload inboxes from disk
            console.log("wtf, we have a bad inboxes");
            return false;
        }
        this.removeOldItems(); //before we save see if there is anything we can clean up
        if (this.inboxes.lastChange > this.lastInboxesSave) {
            try {
                var save = this.inboxes.stringify();
                if (save) {
                    //save an old copy just in case
                    exec('cp '+this.inboxDiskFile+' '+this.inboxDiskFile+".old", function (err, stdout, stderr) {
                        if (err) throw "cp returned error code: "+err.code;                        
                        try {
                            //this is not async
                            fs.writeFileSync(this.inboxDiskFile, save, 'utf8');
                            this.lastInboxesSave = (new Date()).getTime();
                            return true;
                        } catch (e) {
                            console.log("could not write inboxes to file because: "+e);
                        }
                    }.bind(this));
                } else {
                    //TODO: reload inboxes from disk
                    console.log("could not stringify inboxes");
                }
            } catch (e) {
                console.log("could not save inboxes msg: "+e);
            }
        }
    },
    
    /*
    loads inbox from either disk or localStorage
    */    
    loadInboxFromStorage: function (callback) {
        try {        
            if (extension) {
                if (localStorage.getItem(this.localStorageInboxesKey)) {
                    inboxes.loadFromJSON(localStorage.getItem(this.localStorageInboxesKey));                
                }
                this.inboxes.lastChange = (localStorage.getItem(this.localStorageUpdatedKey) ? localStorage.getItem(this.localStorageUpdatedKey) : 0);
                if (callback) {
                    callback(this.inboxes.lastChange);
                }
            } else {
                try {
                    var fileString = fs.readFileSync(this.inboxDiskFile, 'utf8');
                    //when we load inboxes for the first time, we need to make sure we have the file loaded with {}
                    if (!fileString) {
                        console.log("could not load inbox from file! empty!");
                        throw "empty_inboxes";
                    } else {
                        
                        this.inboxes.loadFromJSON(fileString);
                        //loading into users
                        if (users) {
                            this.inboxes.forEach(function(inbox, user) {
                                if (inbox && inbox[0] && inbox[0].time) {
                                    try {
                                        users.getUser(user).lastUpdated = inbox[0].time;
                                    } catch (e) {
                                        console.log("Could not load user: "+user+" last updates! because: "+e);
                                    }
                                }
                            }.bind(this));
                        } else {
                            console.log("Could not load any users last updates!");
                        }
                        console.log("Loaded inbox from file");
                    }
                } catch (e) {
                    console.log("could not load inbox from file! error: "+e);
                    throw e;
                }
            }
        } catch (e) {
            console.log("could not load inboxes error: "+e);
            throw e; //make sure we crash script
        }
        if (callback) {
            callback();
        }
    },
};

console.log("Inboxes loaded");

//in case we use this to manage our extension inbox cache
inboxes.loadInboxFromStorage(function() {
    if (!extension) {
        //TODO catch calls in here and console.log not the other way around
        setInterval(function() { inboxes.saveInboxToDisk(); }, inboxes.saveInboxesToDiskInterval);
    } else {
        setInterval(function() { inboxes.removeOldItems(); }, inboxes.saveInboxesToDiskInterval);
    }
    if (onInboxLoad) {
        onInboxLoad();
    }
});
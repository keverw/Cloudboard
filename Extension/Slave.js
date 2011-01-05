if(!com) var com={};
if(!com.cloudboard) com.cloudboard={};

com.cloudboard.Slave = function(document, window, localStorage, chrome) {
    
    function saveGSSongToDiv() {        
        if (!document.getElementById('cloudboardGSSong')) {
            var div = document.createElement('div');
            div.id = "cloudboardGSSong";
            div.className = "cb-loading";
            document.body.appendChild(div);
        }        
        try {
            var song = GS.player.getPlaybackStatus();
            song = GS.Models.Song.getOneFromCache(song.activeSong.songID);
            if (song._token) {
                document.getElementById('cloudboardGSSong').className = 'cb-'+song._token;
            } else {
                document.getElementById('cloudboardGSSong').className = 'cb-'+song.activeSong.songID;
            }
        } catch (e) {
            document.getElementById('cloudboardGSSong').className = "cb-none";
        }
    }
    
    //do background's bidding
    chrome.extension.onRequest.addListener(
        function(request, sender, sendResponse) {
            switch (request) {
                case "gsSong":
                    var script = document.createElement('script');
                    script.appendChild(document.createTextNode('('+ saveGSSongToDiv +')();'));
                    document.body.appendChild(script);
                    setTimeout(function() {
                        var details = document.getElementById('cloudboardGSSong').className;
                        details = details.substr(3);
                        try {
                            if (parseInt(details) == details) {
                                sendResponse(details);
                            } else if (details != "none" && details != "loading" && details != "undefined" && details != "null") {
                                sendResponse(details);
                            } else {
                                alert("We could not detect a song playing. Try again.");
                            }
                        } catch (e) {
                            alert("We could not detect a song playing. Try again.");
                        }
                    }, 50);
                break
                default:
                    sendResponse({});
                break
            }
    });
}

com.cloudboard.Slave(document, window, localStorage, chrome);
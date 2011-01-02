<?php
require(".config.php");
require("master.php");
require("db.php");
$showInbox = false;
if (isset($_GET['token'])) {
    if (!headers_sent()) {
        header('Access-Control-Allow-Origin: *');
    }
    $db = db::instance();
    $_GET['token'] = str_replace(" ", "+", $_GET['token']);
    if (($user = $db->authExists($_GET['token'])) !== false) {        
        if (isset($_GET['post'])) {
            $text = file_get_contents("php://input");
            if ($db->checkForDup($user, $text)) {
                if ($db->addItem($user, $text)) {
                    die("true");
                } else {
                    die("false");
                }
            } else {
                die("dup");
            }            
        } else {
            $showInbox = true;
            $items = $db->getItems($user);
        }
    } else {
        if (isset($_GET['post'])) {
            $message = "invalid_token";
        } else {
            $message = "Invalid Token";
        }
    }
    if (isset($message)) {
        die($message);
    }    
} else {
    session_start();
    if (isset($_SESSION['googleEmail'])) {
        $db = db::instance();
        $user = $db->getUser($_SESSION['googleEmail']);
        if ($user) {
            $auth = $db->getUserAuth($user);
        } else {
            $auth = encryptAuth($_SESSION['googleEmail']);
            $user = $db->addUser($auth, $_SESSION['googleEmail']);
            if ($user) {
                file_put_contents(USERFILE, $user.":".$auth."\n", FILE_APPEND);
                sendRequestToNodeJS("newuser");
            }
        }
    }
}
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">

<head>
	<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
	<title>Cloudboard</title>
    <?php
    if ($showInbox) {
        ?>
        <script type="text/javascript">
        
        function fitContent(id, maxHeight) {
           var text = id && id.style ? id : document.getElementById(id);
           if (!text) return;
           text.style.height = "14px";
           var adjustedHeight = text.scrollHeight;
           if (maxHeight) adjustedHeight = Math.min(maxHeight, adjustedHeight);
           text.style.height = adjustedHeight + "px";
        }
        </script>
        <style type="text/css">
        * {
            margin:0;
            padding:0;
        }
        
        ul li {
            font-size:11px;
            margin-bottom: 5px;
            border-bottom: black solid 1px;
            width:100%;
            text-align: right;
        }
        
        textarea {
            font-size:11px;
            resize:none;
            border:none;
            padding:0;
            width: 99%;
            margin:0;
            overflow:hidden;
            
        }
        
        </style>
        <?php
    } else {
    ?>
    <script type="text/javascript" src="googleOpenIDPopup.js"></script>
    <script type="text/javascript">
    
    var googleOpener = googleOpenIDPopup.createPopupOpener({
        'realm' : 'http://cloudboard.jhartig.com',
        'opEndpoint' : "https://www.google.com/accounts/o8/ud",
        'returnToUrl' : 'http://cloudboard.jhartig.com/openidCallback.php',
        'shouldEncodeUrls' : true,
        'extensions' : {
            'openid.ns.ax' : 'http://openid.net/srv/ax/1.0',
            'openid.ax.mode' : 'fetch_request',
            'openid.ax.type.email' : 'http://axschema.org/contact/email',
            'openid.ax.required' : 'email'
        }
        }
    );
    
    if (!window.confirmGoogle) {
        window.confirmGoogle = function(data) {
            console.error(data);
            try {
                data = JSON.parse(data);
            } catch(err) {
                loginFailed();
            }
            if (data.mode == "cancel" || data.error == "cancel") {
                //do nothing
            } else if (data.error) {
                loginFailed();
            } else {
                location.reload(true);
            }

        }
    }
    
    function loginFailed() {
        alert("Google login failed!");
    }
    
    function login() {
        googleOpener.popup(450,400);
    }
    
    </script>
    <?php
    }
    ?>
</head>

<body>
<?php
    if ($showInbox) {
        //echo "inbox";
        echo '<p style="width:100px;text-align:center;font-weight:bold;margin:2px auto;">Pastes</p>';
        echo "<ul>";
        foreach($items as $item) {
            echo "<li><textarea onclick='this.focus();fitContent(this);this.select();' onblur='fitContent(this,60); readonly='readonly';>".$item."</textarea></li>";
        }
        echo "</ul>";
        ?>
        <script type="text/javascript">
        var textboxes = document.getElementsByTagName("textarea");        
        for (var textbox in textboxes) {
            fitContent(textboxes[textbox],60);
        }
        </script>
        <?php
    } else if (isset($auth)) {
        echo "<p>Auth: ".urlencode($auth)."</p>";
        ?>
        <p><a href="https://chrome.google.com/webstore/detail/biiibckinakeiomclcbohpmhbidkfpkk">Download extension</a><br /> To use, select text on a webpage and right click, then hit Copy to Cloudboard, then on the new computer, 
        Hit the icon in the menubar and select the entry.<br /> 
        You can also right click on a page or link to copy the URL, on an image to copy the source url.<br />
        You are allowed max of 10 entries at a time and the oldest entries will be deleted if you go over.<br />
        Entries are deleted automatically after 10 hours.
        <br /><br />
        Hit me up at @fastest963 or cloudboard@jhartig.com if you have any problems.</p>
        <?php
    } else if (isset($message)) {
        echo $message;
    } else {
        ?>
        <h1>Cloudboard</h1>
        <p><em>A Cloud Clipboard. Share text, urls, pages, images, etc. between machines.</em></p>
        <p>Login with your Google Account to get an Authorization code and to download the extension.</p>
            <input type="button" onclick="login()" value="Login with Google" />
        <?php
    }
?>
<!-- Start of Woopra Code -->
<script type="text/javascript">
var woo_settings = {idle_timeout:'60000', domain:'cloudboard.jhartig.com'};
var woo_actions = [{type:'pageview',url:window.location.pathname+window.location.search,title:document.title}];
(function(){
var wsc = document.createElement('script');
wsc.src = document.location.protocol+'//static.woopra.com/js/woopra.js';
wsc.type = 'text/javascript';
wsc.async = true;
var ssc = document.getElementsByTagName('script')[0];
ssc.parentNode.insertBefore(wsc, ssc);
})();
</script>
<!-- End of Woopra Code -->
</body>
</html>
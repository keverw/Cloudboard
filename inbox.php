<?php
//this is the inbox for versions >=0.6
require(".config.php");
require("master.php");
require("db.php");

if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
}

function postInvalidToken() {
    if (isset($_GET['post'])) {
        die("invalid_token");
    } else {
        die("Invalid Token");
    }
}

if (isset($_GET['token'])) {
    $db = db::instance();
    $_GET['token'] = str_replace(" ", "+", $_GET['token']);
    if (($user = $db->authExists($_GET['token'])) !== false) {

        $items = $db->getItems($user, true);
        if (isset($_GET['callback'])) {
            header("Content-type: application/javascript; charset=utf-8");
            die($_GET['callback'] . "(" . json_encode($items) . ")");
        } else {
            header("Content-type: application/json; charset=utf-8");
            echo json_encode($items);
            exit(0);
        }
        
    } else {
        postInvalidToken();
    }
} else {
    postInvalidToken();
}
?>

<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">

<head>
	<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
	<title>Cloudboard</title>
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
            width: 90%;
            margin:0;
            overflow:hidden;
            
        }
        
    </style>
</head>

<body>
<p style="width:100px;text-align:center;font-weight:bold;margin:2px auto;">Pastes</p>
<ul>
<?php
foreach($items as $item) {
    echo "
    <li>
        <textarea onclick='this.focus();fitContent(this);this.select();' onblur='fitContent(this,60); readonly='readonly';>".$item['text']."</textarea>
    </li>";
}
?>
</ul>
<script type="text/javascript">
var textboxes = document.getElementsByTagName("textarea");        
for (var textbox in textboxes) {
    fitContent(textboxes[textbox],60);
}
</script>
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
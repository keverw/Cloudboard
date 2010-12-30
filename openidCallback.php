<?php

if (isset($_GET['openid_mode']) && $_GET['openid_mode'] == "cancel") {
    $jsonData = json_encode(array('error' => 'cancel'));
} else {
    if (!(isset($_GET['openid_response_nonce']) && isset($_GET['openid_identity']) && isset($_GET['openid_mode']) && isset($_GET['openid_sig']))) {
        $jsonData = json_encode(array('error' => 'bad_return'));
    } else {
        $verify = file_get_contents("https://www.google.com/accounts/o8/ud?" . str_replace(array("&openid.mode=id_res", "&openid.mode=cancel"), "&openid.mode=check_authentication", $_SERVER['QUERY_STRING']));
        if (strpos($verify, "is_valid:true") === false) {
            $jsonData = json_encode(array('error' => 'no_verify'));
        } else {                
            $idURL = false;
            if (isset($_GET['openid_claimed_id'])) {
                $idURL = substr(urldecode($_GET['openid_claimed_id']), 0, 128);
            } 
            if (!$idURL && isset($_GET['openid_identity'])) {
                $idURL = substr(urldecode($_GET['openid_identity']), 0, 128);
            }
            if (!$idURL) {
                $id = false;
                $jsonData = json_encode(array('error' => 'code:998'));
            } else {
                date_default_timezone_set("GMT");        
                $timeOfRequest = strtotime(substr($_GET['openid_response_nonce'], 0, 19));
                if (abs(time() - $timeOfRequest) > 30) { // 30 second timeout
                    $jsonData = json_encode(array('error' => 'replay'));
                }            
                //take the OAuth variables and send them to our JS client
                //to do that we must construct a JS object
                $data = array();
                if (isset($_GET['openid_ext1_value_firstname'])) {    
                    $data['firstName'] = substr(urldecode($_GET['openid_ext1_value_firstname']), 0, 80);
                }
                if (isset($_GET['openid_ext1_value_lastname'])) {
                    $data['lastName'] = substr(urldecode($_GET['openid_ext1_value_lastname']), 0, 80);
                }
                if (isset($_GET['openid_ext1_value_email'])) {
                    $email = $data['email'] = substr(urldecode($_GET['openid_ext1_value_email']), 0, 150);
                }
                
                $id  = str_replace(array("https://www.google.com/accounts/o8/id?id=", "https://www.google.com/accounts/o8/id/id=", "https://www.google.com/accounts/o8/id"), "", $idURL);
                $data['mode'] = substr($_GET['openid_mode'], 0, 20);        
                $jsonData = json_encode($data);
                
                session_start();
                $_SESSION['googleID'] = $id;
                $_SESSION['googleEmail'] = (isset($email) && $email ? $email : $id);
                
            }
        }
    }
}
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
        <script type="text/javascript">
        //<!--
        if (window.opener && window.opener.confirmGoogle) {
            window.opener.confirmGoogle('<?php echo $jsonData; ?>');
            self.close();
        }
        //-->
        </script>
</head>
<body>
<p>Close this window.</p>
</body>
</html>

<?php

function encryptAuth($email) {
    $td = mcrypt_module_open(MCRYPT_DES, '', MCRYPT_MODE_ECB, '');
    $key = substr(SECRET, 0, mcrypt_enc_get_key_size($td));
    $iv_size = mcrypt_enc_get_iv_size($td);
    $iv = mcrypt_create_iv($iv_size, MCRYPT_RAND);
    
    if (mcrypt_generic_init($td, $key, $iv) != -1) {
        $id = mcrypt_generic($td, mt_rand(10000,999999).sha1($email));
        mcrypt_generic_deinit($td);
        mcrypt_module_close($td);
    } else {
        return false;
    }
    return sha1($id);
}

function sendRequestToNodeJS($method, $data=false) {
    $ch = curl_init("http://127.0.0.1:8100/".$method);
    if ($data) {
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    }
    curl_setopt($ch, CURLOPT_HEADER, 0);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 500); //1sec TOPS //CURLOPT_CONNECTTIMEOUT_MS wtf
    curl_setopt($ch, CURLOPT_TIMEOUT, 2); //1 seconds TOPS
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    return curl_exec($ch);
}

?>
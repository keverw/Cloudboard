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

?>
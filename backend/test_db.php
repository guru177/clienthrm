<?php
try {
    $db = new PDO('sqlite:../database/database.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Update dummy applications with a real dummy PDF URL
    $stmt = $db->prepare("
        UPDATE job_applications 
        SET resume = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
        WHERE tracking_number IN ('APP-DUMMY1', 'APP-DUMMY2')
    ");
    $stmt->execute();

    echo "Updated dummy ATS applications with real PDF URL.";
} catch (Exception $e) {
    echo $e->getMessage();
}
?>

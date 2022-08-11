*NodeJS MAIL API*

A small NodeJS Microservice that allows getting mails from IMAPS server and sending mails via SMTPS server

start: node index.js <ACCESS TOKEN>
  
*API FUNCTIONALITY:*
  
By default, the microservice listens on port 8081 and waits for incoming requests
  
*API methods*:
 
GET /get-folders?token=<ACCESS_TOKEN>&folder=<MAILBOX/FOLDER>&username=<ACCOUNT_USERNAME>&password=<ACCOUNT_PASSWORD>&host=<HOST>&imap_port=<IMAP_PORT>:

gives back a nested array of all account mailboxes / folders

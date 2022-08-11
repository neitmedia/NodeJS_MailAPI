// import necessary modules
var auth_token = process.argv[2];
var express = require("express");
const bodyParser = require("body-parser");
var app = express();
app.use(bodyParser.urlencoded({ limit: '30mb', extended: true }));
app.use(bodyParser.json({ limit: '30mb' }));
var htmlspecialchars = require('htmlspecialchars');
var router = express.Router();
const simpleParser = require('mailparser').simpleParser;
const MailComposer = require("nodemailer/lib/mail-composer");
const nodemailer = require("nodemailer");
var htmlToText = require('nodemailer-html-to-text').htmlToText;
const { convert } = require('html-to-text');

var Imap = require('imap'),
    inspect = require('util').inspect;
    
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// function that creates a fancy array from IMAP folder data array
function imapNestedFolders(folders) {
	
	var FOLDERS = [];
	var folder  = {};
	
	for (var key in folders) {
	
    	if (folders[key].attribs.indexOf('\\HasChildren') > -1) {
	
        	var children = imapNestedFolders(folders[key].children);
	
        	folder = {
            	name        : key,
            	children    : children
        	};
	
    	} else {
	
        	folder = {
            	name        : key,
            	children    : null
        	};
    	}
	
    	FOLDERS.push(folder);
	
	}
	return FOLDERS;
}

// function that converts datetime string to timestamp
function toTimestamp(datestr){
	return Date.parse(datestr);
}

function toHRDate(date) { 
	return date.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit'})+' '+date.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit', timeZone: 'Europe/Berlin' });
}

function parseIMAPDate(imapDate) {
	var d = new Date(imapDate);
	return d;
}

// function that handles the authentication procedure
function auth(access_token) {
	if (access_token == auth_token) {
		return true;
	} else {
		return false;
	}
}

router.post("/send-mail", async (req,res) => {

	var mail_folder = decodeURI(req.body.folder);
	var mail_uid = decodeURI(req.body.mail_uid);
	var mail_forward = decodeURI(req.body.mail_forward);
	var mail_draft = decodeURI(req.body.mail_draft);
	var account = decodeURI(req.body.account);
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	var smtp_port = decodeURI(req.body.smtp_port);
	var sent_folder = decodeURI(req.body.sent_folder);
	var recipients = decodeURI(req.body.recipients);
	var cc = decodeURI(req.body.cc);
	var bcc = decodeURI(req.body.bcc);
	var subject = decodeURI(req.body.subject);
	var attachments = req.body.attachments;
	var html = decodeURI(req.body.html);
	var access_token = req.body.token;
	
	if (auth(access_token)) {
	
			if ((mail_forward != "true") && (mail_draft == "false")) {
	
				var email = {from: account, sender: account, to: recipients,  cc:cc, bcc:bcc, inReplyTo: mail_uid, subject: subject, html: html, attachments: attachments};
				
				var transporter = nodemailer.createTransport({
  					host: host,
  					port: smtp_port,
  					secure: true,
  					auth: {
    					user: username,
    					pass: password,
  					}
				});
				
				transporter.use('compile', htmlToText());
				
				transporter.use('stream', (mail, callback) => {
    	   		var mail = new MailComposer(mail.data);
    				
		   		mail.compile().build(function(err, message){
    					// create Imap object with credentials
						var imap = new Imap({
							user: username,
							password: password,
							host: host,
							port: imap_port,
							tls: true
						});
						
						if (mail_uid != "new") {
							imap.connect();
    						imap.once('ready', function() {
								imap.openBox(sent_folder, false, function(err, box) {
									imap.append(message);
									imap.openBox(mail_folder, false, function(err, box) {
										imap.addFlags(mail_uid, ['\\Answered'], function(err) {
											callback();
										});
									});
								});
							});
						} else {
							imap.connect();
							imap.once('ready', function() {
								imap.openBox(sent_folder, false, function(err, box) {
									imap.append(message);
									callback();
								});
							});
						}
					});
					
				});
				
				// verify connection configuration
				transporter.verify(function (error, success) {
  					if (error) {
    					console.log(error);
  					} else {
    					console.log("Server is ready to take our messages");
  					}
				});
				
				transporter.sendMail(email, (error, info) => {
        			if (error) {
            			return console.log(error);
        			}
        			console.log('Message sent: %s', info.messageId);
        			res.send("ok");
				});
			} else if ((mail_forward == "true") && (mail_draft == "false")) {
				console.log("forwarding mail "+mail_folder+"/"+mail_uid);
				console.log(attachments);
				
				/* get mail to be forwarded */
				
				// create Imap object with credentials
				var imap = new Imap({
					user: username,
					password: password,
					host: host,
					port: imap_port,
					tls: true
				});
				
				// connect to imap server
				imap.connect();
				
				// get mail
    			imap.once('ready', function() {
    				console.log("imap ready");
					imap.openBox(mail_folder, false, function(err, box) {
							console.log("opened box");
							
							imap.addKeywords(mail_uid, '$Forwarded', function(err) {
								console.log("mail flagged as forwarded");
							});
							
							imap.search([ 'ALL', ['UID', mail_uid]], function(err, results) {
							console.log("searched for mails");
							var f = imap.fetch(results, { bodies: '' });
							
    						f.on('message', function(msg, seqno) {
    							console.log("got message");
    							var buffer = '';
      							msg.on('body', function(stream, info) {
      								console.log("got message body");
        	 						stream.on('data', function(chunk) {
          	 							buffer += chunk.toString('utf8');
        	 						});
        	 					});
      							msg.once('end', function() {
      								simpleParser(buffer)
          	 						.then(parsed => {
          	 								msg_array = [];
          	 								msg_array.html = parsed.html;
          	 								msg_array.text = parsed.text;
          	 						 
          	 								var attachment_infos = [];
          	 								
          	 								// add attachment to attachment array if attachment has not been removed by the user
          	 								parsed.attachments.forEach(element => {
          	 									if ((attachments !== undefined)) {
          	 										attachments.forEach(editor_attachment => {
          	 											if (editor_attachment.filename == element.filename) {
          	 												if (editor_attachment.content == "") {
          	 													attachment_infos.push({"filename":element.filename, "content":element.content, "encoding":element.encoding});
          	 												}
          	 											}
          	 										});
          	 									}
											});

											if (attachments !== undefined) {
          	 									// add additional attachments added by the user
          	 									attachments.forEach(editor_attachment => {
          	 										if (editor_attachment.content != "") {
          	 											attachment_infos.push(editor_attachment);
          	 										}
          	 									});
          	 								}
          	 										
											msg_array.attachments = attachment_infos;
          	 								
          	 								var email = {from: account, sender: account, to: recipients, cc:cc, bcc:bcc, subject: subject, html: html, attachments: msg_array.attachments};
				
											var transporter = nodemailer.createTransport({
  												host: host,
  												port: smtp_port,
  												secure: true,
  												auth: {
    												user: username,
    												pass: password,
  												}
											});
											
											transporter.use('compile', htmlToText());
											
											// verify connection configuration
											transporter.verify(function (error, success) {
  												if (error) {
    												console.log(error);
  												} else {
    												console.log("Server is ready to take our messages");
  												}
											});
											
											transporter.sendMail(email, (error, info) => {
											
        										if (error) {
            										return console.log(error);
        										}
        										
        										imap.openBox(sent_folder, false, function(err2, box2) {
        										
        										
        											var mail = new MailComposer(email);
        											mail.compile().build(function(err, message){
    													imap.append(message);
    													console.log("message saved in sent folder");
													});
        										
        											res.send("ok");
        										});
        										
        										console.log('Message sent: %s', info.messageId);
        						
											});
          	 							});
      							});
    						});
						});
					});
				});
				
			} else if ((mail_forward == "false") && (mail_draft == "true")) {
				console.log("sending drafted mail "+mail_folder+"/"+mail_uid);
				console.log(attachments);
				
				/* get mail to be forwarded */
				
				// create Imap object with credentials
				var imap = new Imap({
					user: username,
					password: password,
					host: host,
					port: imap_port,
					tls: true
				});
				
				// connect to imap server
				imap.connect();
				
				// get mail
    			imap.once('ready', function() {
    				console.log("imap ready");
					imap.openBox(mail_folder, false, function(err, box) {
							console.log("opened box");
							
							imap.search([ 'ALL', ['UID', mail_uid]], function(err, results) {
							console.log("searched for mails");
							var f = imap.fetch(results, { bodies: '' });
							
    						f.on('message', function(msg, seqno) {
    							console.log("got message");
    							var buffer = '';
      							msg.on('body', function(stream, info) {
      								console.log("got message body");
        	 						stream.on('data', function(chunk) {
          	 							buffer += chunk.toString('utf8');
        	 						});
        	 					});
      							msg.once('end', function() {
      								simpleParser(buffer)
          	 						.then(parsed => {
          	 								msg_array = [];
          	 								msg_array.html = parsed.html;
          	 								msg_array.text = parsed.text;
          	 						 
          	 								var attachment_infos = [];
          	 								
          	 								// add attachment to attachment array if attachment has not been removed by the user
          	 								parsed.attachments.forEach(element => {
          	 									if ((attachments !== undefined)) {
          	 										attachments.forEach(editor_attachment => {
          	 											if (editor_attachment.filename == element.filename) {
          	 												if (editor_attachment.content == "") {
          	 													attachment_infos.push({"filename":element.filename, "content":element.content, "encoding":element.encoding});
          	 												}
          	 											}
          	 										});
          	 									}
											});

											if (attachments !== undefined) {
          	 									// add additional attachments added by the user
          	 									attachments.forEach(editor_attachment => {
          	 										if (editor_attachment.content != "") {
          	 											attachment_infos.push(editor_attachment);
          	 										}
          	 									});
          	 								}
          	 										
											msg_array.attachments = attachment_infos;
          	 								
          	 								var email = {from: account, sender: account, to: recipients, cc:cc, subject: subject, html: html, attachments: msg_array.attachments};
				
											var transporter = nodemailer.createTransport({
  												host: host,
  												port: smtp_port,
  												secure: true,
  												auth: {
    												user: username,
    												pass: password,
  												}
											});
											
											transporter.use('compile', htmlToText());
											
											// verify connection configuration
											transporter.verify(function (error, success) {
  												if (error) {
    												console.log(error);
  												} else {
    												console.log("Server is ready to take our messages");
  												}
											});
											
											transporter.sendMail(email, (error, info) => {
											
        										if (error) {
            										return console.log(error);
        										}
        										
        										imap.openBox(sent_folder, false, function(err2, box2) {
        										
        										
        											var mail = new MailComposer(email);
        											mail.compile().build(function(err, message){
    													imap.append(message);
    													console.log("message saved in sent folder");
													});
        										
        											res.send("ok");
        										});
        										
        										console.log('Message sent: %s', info.messageId);
        						
											});
          	 							});
          	 						
      							});
    						});
						});
					});
				});
				
			}
	} else {
		res.send("auth error");
	}
});

router.post("/save-draft", async (req,res) => {
	var mail_folder = decodeURI(req.body.folder);
	var mail_uid = decodeURI(req.body.mail_uid);
	var mail_forward = decodeURI(req.body.mail_forward);
	var account = decodeURI(req.body.account);
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	var smtp_port = decodeURI(req.body.smtp_port);
	var sent_folder = decodeURI(req.body.sent_folder);
	var recipients = decodeURI(req.body.recipients);
	var cc = decodeURI(req.body.cc);
	var subject = decodeURI(req.body.subject);
	var attachments = req.body.attachments;
	var html = decodeURI(req.body.html);
	var access_token = req.body.token;
	
	if (auth(access_token)) {
	
		var email = {from: account, sender: account, to: recipients, cc: cc, inReplyTo: mail_uid, subject: subject, html: html, attachments: attachments};
	
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
				
		// connect to imap server
		imap.connect();
				
		// create and save mail
    	imap.once('ready', function() {
    		console.log("imap ready");
			var mail = new MailComposer(email);
			mail.compile().build(function(err, message){
				imap.append(message, {"mailbox":"Drafts", "flags":["\\Draft"]}, function() {
					console.log("saved mail in draft folder");
					res.send("ok");
				});
			});
		});
	} else {
		res.send("auth error");
	}
});

router.post("/delete-mail", async (req,res) => {
	var mail_folder = decodeURI(req.body.folder);
	var mail_uids = req.body.mail_uids;
	var access_token = req.body.token;
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	
	if (auth(access_token)) {
		
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();

		imap.once('ready', function() {
			imap.openBox(mail_folder, true, function(err, box) {
				imap.addFlags(mail_uids, ['\\Deleted'], function(err) {});
				imap.move(mail_uids, 'Trash', function(err) {});
				res.send("ok");
			});
		});
		
	} else {
		res.send("auth error");
	}
});

router.post("/expunge-mail", async (req,res) => {
	var mail_folder = decodeURI(req.body.folder);
	var mail_uids = req.body.mail_uids;
	var access_token = req.body.token;
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	
	if (auth(access_token)) {
		
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		imap.once('ready', function() {
			imap.openBox(mail_folder, false, function(err, box) {
				imap.addFlags(mail_uids, ['\\Deleted'], function(err) {
					imap.closeBox(true, function() {
						res.send("ok");
					});
				});
			});
		});
		
	} else {
		res.send("auth error");
	}
});

router.post("/delete-folder", async (req,res) => {
	var folder = decodeURI(req.body.folder);
	var access_token = req.body.token;
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	
	if (auth(access_token)) {
		console.log("delete folder "+folder);
		
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
		
		// connect to IMAP server
		imap.connect();

		imap.once('ready', function() {
			imap.delBox(folder, function() {
				res.send("ok");
			});
		});
	} else {
		res.send("auth error");
	}
});

router.post("/move-mail", async (req,res) => {
	var src_folder = decodeURI(req.body.src_folder);
	var dest_folder = decodeURI(req.body.dest_folder);
	var mail_uids = req.body.mail_uids;
	var access_token = req.body.token;
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);

	if (auth(access_token)) {
		
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
		
		// connect to IMAP server
		imap.connect();

		imap.once('ready', function() {
			imap.openBox(src_folder, true, function(err, box) {
				imap.move(mail_uids, dest_folder, function(err) {
					res.send("ok");
				});
			});
		});
		
	} else {
		res.send("auth error");
	}
}); 

router.post("/create-folder", async (req,res) => {
	var folder = decodeURI(req.body.folder);
	var access_token = req.body.token;
	var username = decodeURI(req.body.username);
	var password = decodeURI(req.body.password);
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);

	if (auth(access_token)) {
		
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true 
		});
		
		// connect to IMAP server
		imap.connect();

		imap.once('ready', function() {
			imap.addBox(folder, function() {
				res.send("ok");
			});
		});
		
	} else {
		res.send("auth error");
	}
});

router.get("/get-folders", async (req,res) => {
	var return_array = [];
	// get post data
	var access_token = req.query.token;
	var mail_folder = decodeURI(req.query.folder);
	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  			imap.getBoxes(function (err, boxes) {
  				res.json(imapNestedFolders(boxes));
  			});
  		});  		
  	}
});

router.post("/add-flag", async (req,res) => {
	// get post data
	var access_token = req.body.token;
	var mail_folder = decodeURI(req.body.folder);
	var mail_uids = req.body.mail_uids;
	var username = req.body.username;
	var password = req.body.password;
	var flag = req.body.flag;
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});

		// connect to IMAP server
		imap.connect();
		  
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  			console.log("connected to IMAP server");
  			imap.openBox(mail_folder, false, function(err, box) {
  				console.log("opened mailbox "+mail_folder);
  				imap.addFlags(mail_uids, [flag], function(err) {
					console.log("added flag '"+flag+"' to mails");
					res.send("ok");
				});
  			});
  		});  		
  	}
});

router.post("/delete-flag", async (req,res) => { 
	// get post data
	var access_token = req.body.token;
	var mail_folder = decodeURI(req.body.folder);
	var mail_uids = req.body.mail_uids;
	var username = req.body.username;
	var password = req.body.password;
	var flag = req.body.flag;
	var host = decodeURI(req.body.host);
	var imap_port = decodeURI(req.body.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});

		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  			console.log("connected to IMAP server");
  			imap.openBox(mail_folder, false, function(err, box) {
  				console.log("opened mailbox "+mail_folder);
  				imap.delFlags(mail_uids, [flag], function(err) {
					console.log("deleted flag '"+flag+"' from mails");
					res.send("ok");
				});
  			});
  		});  		
  	}
});

router.get("/get-folders", async (req,res) => {
	var return_array = [];
	// get post data
	var access_token = req.query.token;
	var mail_folder = decodeURI(req.query.folder);
	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  			imap.getBoxes(function (err, boxes) {
  				res.json(imapNestedFolders(boxes));
  			});
  		});  		
  	}
});

router.get("/list", async (req,res) => {
	var return_array = [];
	var dump_counter = 0;
	// get post data
	var access_token = req.query.token;
	var mail_folder = decodeURI(req.query.folder);
	var search_string = decodeURI(req.query.search_string);
	var sort_criterion = decodeURI(req.query.sort_criterion);
	var sort_direction = decodeURI(req.query.sort_direction);
	var mail_count = 0;
	var start_index = req.query.start;
	var end_index = req.query.end;
	var since = req.query.since;
	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
			var fs = require('fs'), fileStream;
			imap.openBox(mail_folder, true, function(err, box) {
			
			console.log(mail_folder);
			console.log(username);
			console.log(password);
			
				let sort_criterion_direction = sort_direction+sort_criterion;

				if (search_string == "") {
					search_criteria_arr = ['ALL'];
				} else {
					//search_criteria_arr = ['ALL', ["OR", ['FROM', search_string], ["OR", ['TO', search_string], ["OR", ['SUBJECT', search_string], ['BODY', search_string]]]]];
					search_criteria_arr = ['ALL', ['TEXT', search_string]];
				}

				imap.sort([sort_criterion_direction], search_criteria_arr, function(err, results) {
    				if (err) throw err;
    				mail_count = results.length;
    				if (mail_count > 0) {
    				
    					if (end_index > -1) {
    						var fetch_results = results.slice(start_index, end_index);
    						
    						// if mail range is selected that is not existing anymore, show the first 10 mails 
    						if (fetch_results.length == 0) {
    							fetch_results = results.slice(0, 10);
    						}
    					} else {
    						fetch_results = results;
    					}
	    					
    					// fetch only, if mail uid array is not empty
    					if (fetch_results.length > 0) {
    						var f = imap.fetch(fetch_results, { bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE CC MESSAGE-ID)', struct: true});
    						
    						f.on('message', function(msg, seqno) {
    						
    							dump_counter++;
    							console.log(dump_counter);
    						
    							var buffer = "";
    							let msg_array = {};
      							var prefix = '(#' + seqno + ') ';
      							msg.on('body', function(stream, info) {
      				
        	 						
        	 						stream.on('data', function(chunk) {
          	 							buffer += chunk.toString('utf8');
        	 						});
        	 					
        	 						stream.once('end', function() {
        	 							let parsed_header = Imap.parseHeader(buffer);
        	 							
        	 							if (parsed_header["message-id"] !== undefined) {
        	 								if (parsed_header["message-id"][0] !== undefined) {
        	 									msg_array.message_id = parsed_header["message-id"][0];
        	 								}
        	 							}
        	 							
        	 							if (parsed_header["date"] !== undefined) {
        	 								msg_array.timestamp = htmlspecialchars(parseIMAPDate(parsed_header["date"][0]));
        	 								msg_array.date = htmlspecialchars(toHRDate(parseIMAPDate(parsed_header["date"][0])));
        	 							} else {
        	 								msg_array.timestamp = "";
        	 								msg_array.date = "";
        	 							}
        	 							
        	 							if (parsed_header["cc"] !== undefined) {
        	 								msg_array.cc = htmlspecialchars(parsed_header["cc"]);
        	 							} else {
        	 								msg_array.cc = "";
        	 							}
        	 							
          	 							msg_array.from = htmlspecialchars(parsed_header["from"]);
          	 							msg_array.to = htmlspecialchars(parsed_header["to"]);
          	 							msg_array.subject = htmlspecialchars(parsed_header["subject"]);
          	 							
          	 								
									}); 
										
        	 					});
      						
      							msg.once('attributes', function(attrs) {
      								msg_array.flags = htmlspecialchars(attrs["flags"]);
      								msg_array.uid = htmlspecialchars(attrs["uid"]);
      								
      								msg_array.has_attachment = false;
      								
      								attrs.struct.forEach(function(element) {
      									if (Array.isArray(element)) {
      										element.forEach(function(mimePart) {
      											if ((mimePart.disposition !== undefined) && (mimePart.disposition !== null) && ((mimePart.disposition.type != "attachment") || (mimePart.disposition.type != "inline"))) {
      												
      												msg_array.has_attachment = true;
      												
      											}
      										});
      									}
      								});
      					
      							});
      						
      							msg.once('end', function() {
									//console.log(msg_array);
									return_array.push(msg_array);
									msg_array.length = 0;
          	 							
      							});
    						});
    						
    						f.once('error', function(err) {
    						
    						});
    						f.once('end', function() {
      							imap.getBoxes(function (err, boxes) {
            						if (err) {
            							res.send("error");
            						} else {
            							//let mail_list_data = return_array.reverse();
            							let mail_list_data = return_array.reverse();
            							let folder_list_data = imapNestedFolders(boxes);
            							
            							console.log("response sent!");
            							
            							res.json({"folders":folder_list_data, "mails":mail_list_data, "count":mail_count, "start":start_index, "end":end_index});
      									imap.end();
            						}
            					});
    						});
    					}
    				} else {
    					imap.getBoxes(function (err, boxes) {
            				if (err) {
            					res.send("error");
            				} else {
            					let mail_list_data = return_array.reverse();
            					let folder_list_data = imapNestedFolders(boxes);
            					
            					res.json({"folders":folder_list_data, "mails":[]});
      							imap.end();
            				}
            			});
    				}
  				});
			});
  		});
  	}
});

function getFolderList(folders, return_array, data_mail_folder_full) {
	folders.forEach(element => {
  		data_mail_folder_full = data_mail_folder_full + element.name+'/'; 
  		return_array.push(data_mail_folder_full.slice(0, -1));
  		
  		if (element.children !== null) {
  			getFolderList(element.children, return_array, data_mail_folder_full);
  		}
  		
  		const myArray = data_mail_folder_full.split("/");
					
		data_mail_folder_full = "";
		for (i=0;i<myArray.length-2;i++) {
			data_mail_folder_full += myArray[i]+'/';
		}
	});
	return return_array;
}

function getMails(imap, counter, search_criteria_arr, folder_array, return_array, res, sort_criterion_direction) {
	 imap.openBox(folder_array[counter], true, function(err, box) {
		   	imap.sort([sort_criterion_direction], search_criteria_arr, function(err, results) {
		   		if (results.length > 0) {
		   			var f = imap.fetch(results, { bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE CC MESSAGE-ID)', struct: true});
    					f.on('message', function(msg, seqno) {
    						var buffer = "";
    							let msg_array = {};
      							var prefix = '(#' + seqno + ') '; 
      							msg.on('body', function(stream, info) {
      				
        	 						
        	 						stream.on('data', function(chunk) {
          	 							buffer += chunk.toString('utf8');
        	 						});
        	 					
        	 						stream.once('end', function() {
        	 							let parsed_header = Imap.parseHeader(buffer);
        	 							msg_array.message_id = parsed_header["message-id"];
        	 							msg_array.folder = folder_array[counter];
        	 							
        	 							if (parsed_header["date"] !== undefined) {
        	 								msg_array.timestamp = htmlspecialchars(parseIMAPDate(parsed_header["date"][0]));
        	 								msg_array.date = htmlspecialchars(toHRDate(parseIMAPDate(parsed_header["date"][0])));
        	 							} else {
        	 								msg_array.timestamp = "";
        	 								msg_array.date = "";
        	 							}
        	 							
        	 							if (parsed_header["cc"] !== undefined) {
        	 								msg_array.cc = htmlspecialchars(parsed_header["cc"]);
        	 							} else {
        	 								msg_array.cc = "";
        	 							}
        	 							
          	 							msg_array.from = htmlspecialchars(parsed_header["from"]);
          	 							msg_array.to = htmlspecialchars(parsed_header["to"]);
          	 							msg_array.subject = htmlspecialchars(parsed_header["subject"]);
          	 							
          	 								
									}); 
										
        	 					});
      						
      							msg.once('attributes', function(attrs) {
      								msg_array.flags = htmlspecialchars(attrs["flags"]);
      								msg_array.uid = htmlspecialchars(attrs["uid"]);
      								
      								msg_array.has_attachment = false;
      								
      								attrs.struct.forEach(function(element) {
      									if (Array.isArray(element)) {
      										element.forEach(function(mimePart) {
      											if ((mimePart.disposition !== undefined) && (mimePart.disposition !== null) && ((mimePart.disposition.type != "attachment") || (mimePart.disposition.type != "inline"))) {
      												
      												msg_array.has_attachment = true;
      												
      											}
      										});
      									}
      								});
      					
      							});
      						
      							msg.once('end', function() {
									return_array.push(msg_array);
      							});
    						});
		   		
		   				f.once('end', function() {
		   					counter++;
		   					if (folder_array.length > counter) {
		   						getMails(imap, counter, search_criteria_arr, folder_array, return_array, res, sort_criterion_direction);
		   					} else {
		   						res.json(return_array);
								imap.end();
		   					}
		   				});
		   		} else {
		   			counter++;
		   			if (folder_array.length > counter) {
		   				getMails(imap, counter, search_criteria_arr, folder_array, return_array, res, sort_criterion_direction);
		   			} else {
		   				res.json(return_array);
		   				//console.log(return_array);
						imap.end();
		   			}
		   		}
		   	});
	});
}

router.get("/global", async (req,res) => {
	// get post data
	var access_token = req.query.token;
	var mail_folder = "INBOX";
	var search_string = decodeURI(req.query.search_string);
	var sort_criterion = decodeURI(req.query.sort_criterion);
	var sort_direction = decodeURI(req.query.sort_direction);
	var mail_count = 0;
	var start_index = req.query.start;
	var end_index = req.query.end;
	var since = req.query.since;
	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  		
  		var boxes_ready = false;
		
		imap.getBoxes(function (err, boxes) {
           let folders = imapNestedFolders(boxes);
           
           var folder_array = [];
           var mail_array = [];
		   var data_mail_folder_full = "";
		   var counter = 0;
           
           getFolderList(folders, folder_array, data_mail_folder_full);
           
           if (search_string == "") {
		      search_criteria_arr = ['ALL'];
		   } else {
		      //search_criteria_arr = ['ALL', ['TEXT', search_string]];
		      search_criteria_arr = [['HEADER', 'message-id', search_string]];
		      //search_criteria_arr = ['ALL', ["OR", ['FROM', search_string], ['TO', search_string]]];
		   }
           
           let sort_criterion_direction = sort_direction+sort_criterion;
           
		   getMails(imap, counter, search_criteria_arr, folder_array, mail_array, res, sort_criterion_direction);
        });
       
  		});
  	}
});

router.get("/index", async (req,res) => {
	// get post data
	var access_token = req.query.token;
	var mail_folder = "INBOX";
	var sort_criterion = decodeURI(req.query.sort_criterion);
	var sort_direction = decodeURI(req.query.sort_direction);
	var mail_count = 0;
	var start_index = req.query.start;
	var end_index = req.query.end;
	var since = req.query.since;
	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
  		
  		var boxes_ready = false;
		
		   imap.getBoxes(function (err, boxes) {
           		let folders = imapNestedFolders(boxes);
           		
           		var folder_array = [];
           		var mail_array = [];
		   		var data_mail_folder_full = "";
		   		var counter = 0;
           		
           		getFolderList(folders, folder_array, data_mail_folder_full);
           		
		   		search_criteria_arr = ['ALL'];
		 		
           		let sort_criterion_direction = sort_direction+sort_criterion;
           		
		   		getMails(imap, counter, search_criteria_arr, folder_array, mail_array, res, sort_criterion_direction);
           });
  		});
  	}
});

router.get("/get/:uid", async (req,res) => {
	// get data from GET parameters
  	let mail_uid = req.params.uid;
  	// get post data
  	let access_token = req.query.token;
  	let mail_folder = req.query.folder;
  	let attachment = req.query.attachment;
  	var username = req.query.username;
	var password = req.query.password;
	var host = decodeURI(req.query.host);
	var imap_port = decodeURI(req.query.imap_port);
	
	console.log(mail_folder);
	console.log(username);
	console.log(password);
	console.log(mail_uid);

	if (auth(access_token)) {
		// create Imap object with credentials
		var imap = new Imap({
			user: username,
			password: password,
			host: host,
			port: imap_port,
			tls: true
		});
	
		// declare and initialize return array
		let return_array = [];
	
		// connect to IMAP server
		imap.connect();
		
		// define what will be executed when connection to server is established
  		imap.once('ready', function() {
			var fs = require('fs'), fileStream;
			imap.openBox(mail_folder, true, function(err, box) {
				imap.search([ 'ALL', ['UID', mail_uid]], function(err, results) {
					var f = imap.fetch(results, { bodies: '' });
    				f.on('message', function(msg, seqno) {
    					let msg_array = {};
      					var prefix = '(#' + seqno + ') ';
      					msg.on('body', function(stream, info) {
      						var buffer = '';
        	 				stream.on('data', function(chunk) {
          	 					buffer += chunk.toString('utf8');
        	 				});
        	 				
        	 				stream.once('end', function() {
        	 					
        	 				let parsed_header = Imap.parseHeader(buffer);
        	 				if (parsed_header["date"] !== undefined) {
        	 					msg_array.timestamp = htmlspecialchars(parseIMAPDate(parsed_header["date"][0]));
        	 					msg_array.date = htmlspecialchars(toHRDate(parseIMAPDate(parsed_header["date"][0])));
        	 				} else {
        	 					msg_array.timestamp = "";
        	 					msg_array.date = "";
        	 				}
        	 				
        	 				if (parsed_header["cc"] !== undefined) {
        	 					msg_array.cc = htmlspecialchars(parsed_header["cc"]);
        	 				} else {
        	 					msg_array.cc = "";
        	 				}
        	 				
          	 				msg_array.from = htmlspecialchars(parsed_header["from"]);
          	 				msg_array.to = htmlspecialchars(parsed_header["to"]);
          	 				msg_array.subject = htmlspecialchars(parsed_header["subject"]);
          	 				
          	 				simpleParser(buffer)
          	 					.then(parsed => {
          	 						msg_array.html = DOMPurify.sanitize(parsed.html);
          	 						msg_array.text = parsed.text;
          	 						
          	 						if (msg_array.text == "") {
          	 							msg_array.text = convert(parsed.html, { wordwrap: 130 });
          	 						}
          	 								
          	 						var attachment_infos = [];
          	 						if (attachment == "false") {
          	 							parsed.attachments.forEach(element => {
  											attachment_infos.push({"filename":element.filename, "contentType":element.contentType, "size":element.size});
										});
									} else {
										attachment_infos = parsed.attachments[attachment];
									}
										
									msg_array.attachments = attachment_infos;
          	 							
          	 						return_array.push(msg_array);
          	 							
          	 						if (attachment == "false") {
          	 							imap.getBoxes(function (err, boxes) {
            								if (err) {
            									res.send("error");
            								} else {
            									let mail_list_data = return_array.reverse();
            									let folder_list_data = imapNestedFolders(boxes);
            										
            									res.json({"folders":folder_list_data, "mails":mail_list_data});
      											imap.end();
            								}
            							});
            						} else {
            							res.json(msg_array.attachments);
            						}
          	 					});
        	 				});
      					});
      					msg.once('attributes', function(attrs) {
      						msg_array.flags = htmlspecialchars(attrs["flags"]);
      						msg_array.uid = htmlspecialchars(attrs["uid"]);
      					});
      					msg.once('end', function() {
      					});
    				});
				});
			});
		});
	}
});

// define constants [PORT and IP]
const PORT = 8081;
const HOST = '0.0.0.0';

// setup middleware
app.use("/", router);

// start listener
app.listen(PORT, function () {
  console.log('NodeJS Mail-API listening on port '+PORT+'!');
})

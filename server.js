// Пример простого сервера в качестве основы

'use strict';
/*
    Не стал использовать express и async
*/

let fs = require("fs");
let url = require("url");
let util = require("util");
let path = require("path");

let currentDir = __dirname;
let pathToFiles = path.join(currentDir, "/files");
let regExpValid = /\//ig;

let optionsStream = {encoding: 'utf-8'};


/*
    Лучше по максимуму использовать замыкания, т.к. в отличии от Apache, все соединения работают с одним скриптом
    и если один пользователь запишет что-то в переменную, то это, само собой, проявится у всех
*/

let mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
}

let maxBytes = 1000000;

require('http').createServer(function(req, res) {

    let pathname = decodeURI(url.parse(req.url).pathname);


    let extName = pathname.substr(pathname.lastIndexOf("."));
    let data = null;
    let fileName = path.join(currentDir, "/files", pathname.substr(1));
    let count = 0;
    let stream = null;
    let isAjax = !!req.headers["x-my-custom-header"];

    let isValid = pathname.slice(1).search(regExpValid) == -1;

    switch(req.method) {
        case 'GET':
            if (!isAjax && pathname == '/') {
                fs.readFile(__dirname + '/public/index.html', (err, content) => {
                    res.setHeader('Content-Type', mimeTypes[".html"]+';charset=utf-8');
                    if (err) {
                        content = "СТРАНИЦА НЕ НАЙДЕНА";
                    }
                    res.end(content);
                });
                return;
            } else if(!isAjax) {
                fs.readFile(__dirname + pathname, (err, content) => {
                    res.setHeader('Content-Type', mimeTypes[extName]+';charset=utf-8');
                    if (err) {
                        content = "";
                    }
                    res.end(content);
                });
                return;
            } else if (isAjax && isValid) {
                console.log("-get file-----PATH "+fileName);
                
                fs.open(fileName, "r", (err, fd) => {//Если добавить к пути: "/./.." и т.д., то работает как надо
                    if (err) {
                        sendStatus(res, 404);
                        res.end("ФАЙЛ НЕ НАЙДЕН");
                        return;
                    }
                    sendStatus(res, 200);
                    stream = fs.createReadStream(null, {fd: fd});
                    readFile(stream, res);
                });

            } else {
                sendStatus(res, 404);
                res.end("ФАЙЛ НЕ НАЙДЕН");
            }
            break;
        case "POST":

            if(isAjax && !isValid) {
                console.log("-post -NOT- file-----PATH "+fileName);
                res.setHeader('Content-Type', 'text/html;charset=utf-8');
                res.end("НЕПРАВИЛЬНЫЙ ПУТЬ");
                return;
            } else if(!isAjax) {
                console.log("post file-----PATH "+fileName);
                fs.readFile(__dirname + pathname, (err, content) => {
                    res.setHeader('Content-Type', mimeTypes[extName]+';charset=utf-8');
                    if (err) {
                        content = "";
                    }
                    res.end(content);
                });
                return;
            }
            console.log("-post -AJAX- file-----PATH "+fileName);   
            fs.open(fileName, "wx", (err, fd) => {
                if (err) {
                    sendStatus(res, 409);
                    res.end("ФАЙЛ СУЩЕСТВУЕТ");
                    return;
                }
                stream = fs.createWriteStream(fileName, {fd: fd});
                sendStatus(res, 200);
                writeFile(req, stream, res, fd, fileName);
                res.on("close", ()=> {
                    stream.destroy();
                });
            });

            break;
        case "DELETE":
            if(isAjax && isValid) {
                console.log("-delete -AJAX- -----DELETE "+fileName);
                fs.unlink(fileName, (err)=> {
                    if(err) {
                        sendStatus(res, 404);
                        res.end("Ошибка");
                        return;
                    }
                    sendStatus(res, 200);
                    res.end("OK");
                    console.log(200, "OK");
                });
            } else {
                sendStatus(res, 404);
                res.end("ФАЙЛ НЕ НАЙДЕН"); 
            }
        break;
        default:
            res.statusCode = 502;
            res.end("Not implemented");
    }

}).listen(8080);

function sendStatus(res, status) {
    res.statusCode = status;
}


function writeFile(req, stream, res, fd, fileName) {
    var data = null;
    let byteLength = 0;
    function writeData() {
        data = req.read();
        
        let isWrite = null;
        
        if(data != null) {
            isWrite = stream.write(data);//Возвращет false, если буфер заполнен
            byteLength+=data.byteLength;
            if(byteLength>maxBytes) {
                sendStatus(res, 413); 
                res.end("РАЗМЕР ФАЙЛА БОЛЬШЕ 1МБ");

                req.removeListener("readable", writeData);
                stream.destroy();
                
                fs.unlink(fileName, (err)=> {
                    if(err) console.log("Ошибка удаления");
                });
                
                
                return;
            }
        }

        if(data && !isWrite) {
            req.removeListener("readable", writeData);
            stream.once("drain", ()=> {//Когда данные из буфера ушли лиенту
                req.on("readable", writeData);
                writeData();//Прочесть что могло накопиться после отдачи клиенту
            })
        }
    }

    stream.on("open", (err) => {
        if(err) {
            sendStatus(res, 500);         
            res.end("Ошибка");
        }
    })
    .on("close", ()=> {
        
    });
    req.on("readable", writeData)
    .on("end", () => {
        fs.close(fd, (err)=>{
            if(err) console.log(err);
        });
        res.end("ОК");
    });

}

function readFile(stream, res) {
    
    // pipe бует читать только когда буфер опустеет

    stream.pipe(res);
    stream.on("readable", ()=>{

    })
    res.on("close", ()=> {
        stream.destroy();
    })
    .on("error", (err)=> {
        if(err) {
            sendStatus(500);
            res.end("Ошибка");
        }
    });
    stream.on("close", ()=>{
        res.end();
    });
}
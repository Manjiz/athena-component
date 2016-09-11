'use strict';

const fs = require('fs');
const path = require('path');
const unzip = require('unzip');
const fstream = require('fstream');
const lodash = require('lodash');
const AV = require('leancloud-storage');
const conf = require('../ac-config.js');
const util = require('../util.js');

const APP_ID = conf.leancloud.APP_ID;
const APP_KEY = conf.leancloud.APP_KEY;
AV.init({
  appId: APP_ID,
  appKey: APP_KEY
});

module.exports = async (ctx, next) => {
  let widget, contHtml, contBuiltHtml, contScss, contBuiltCss, contCss, contJs, contJson;
  
  let id = ctx.request.query.id;
  
  if(!id) { ctx.status = 404; return; }
  
  // util.dumpLog(`访问组件 - ${ctx.ip} -> ${id}`);
  
  // 查找组件
  await new Promise(function(resolve, reject) {
    let query = new AV.Query('Widget');
    query.get(id).then(function (data) {
      widget = data;
      resolve();
    }, function (err) {
      console.error(err);
    });
  });

  // 组件路径
  let widgetTempPath = path.join(conf.warehouse, '_temp', widget.id);
  
  // 解压文件
  await util.unzipWidget( widget.id ).catch(function(err) {
    console.error(err);
  });
  
  // 组件图片路径
  let widgetImgPath = path.join(widgetTempPath, 'images');
  // 组件编译路径
  let widgetBuiltPath = path.join(conf.warehouse, '_build', widget.id);
  // 组件编译图片路径
  let widgetBuiltImgPath = path.join(widgetBuiltPath, 'images');
  // 组件HTML路径
  let contHtmlPath = path.join(widgetTempPath, widget.get('name') + '.html');
  // 组件SCSS路径
  let contScssPath = path.join(widgetTempPath, widget.get('name') + '.scss');
  // 组件CSS路径 - 优先用编译好的CSS文件
  let contBuiltCssPath = path.join(widgetTempPath,  '_build_' + widget.get('name') + '.css');
  let contCssPath = path.join(widgetTempPath, widget.get('name') + '.css');
  // 组件JS路径
  let contJsPath = path.join(widgetTempPath, widget.get('name') + '.js');
  // 组件JSON路径
  let contJsonPath = path.join(widgetTempPath, widget.get('name') + '.json');

  // 读取组件 HTML, SCSS, CSS, JS
  try {contHtml = fs.readFileSync( contHtmlPath ).toString();} catch(err) { /* DO NOTHING */ }
  try {contScss = fs.readFileSync( contScssPath ).toString();} catch(err) { /* DO NOTHING */ }
  try {contBuiltCss = fs.readFileSync( contBuiltCssPath ).toString();} catch(err) { /* DO NOTHING */ }
  try {contCss = fs.readFileSync( contCssPath ).toString();} catch(err) { /* DO NOTHING */ }
  try {contJs = fs.readFileSync( contJsPath ).toString();} catch(err) { /* DO NOTHING */ }
  try {contJson = fs.readFileSync( contJsonPath ).toString();} catch(err) { /* DO NOTHING */ }
  
  // 编译任务，遵循AOTU代码规范
  // 只有在html文件存在时才进行编译
  if(contHtml) {

    // 编译HTML
    try {
      // 根据配置里的虚拟变量进行基本编译
      contHtml = contHtml.replace('<% widget.scriptStart() %>', '').replace('<% widget.scriptEnd() %>', '');
      contBuiltHtml = lodash.template( contHtml )(
        JSON.parse(fs.readFileSync(path.join(widgetTempPath, widget.get('name')+'.json'))).data
      );
    } catch(err) {
      console.error('模板渲染错误：' + err);
    }

    try {
      fs.accessSync( widgetBuiltPath );
    } catch(err) {
      let commonstyle = conf.tpl[`css${widget.get('platform')}`] || '';
      let iframe = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Document</title>
<style>
  ${commonstyle}
  ${contBuiltCss || contCss || ''}
</style>
</head>
<body>
  ${contBuiltHtml}
<script>
  ${contJs}
</script>
</body>
</html>`;
      // 创建编译目录
      fs.mkdirSync( widgetBuiltPath );
      fs.mkdirSync( widgetBuiltImgPath );
      fs.writeFileSync( path.join(widgetBuiltPath, 'index.html'), iframe);
      await new Promise(function(resolve, reject) {
        let writer = fstream.Writer( widgetBuiltImgPath );
        fstream
          .Reader( widgetImgPath )
          .pipe( writer );
        writer.on('close', function() {
          resolve();
        });
      });
    }
  }
  
  // Response
  ctx.body = {
    contHtml: contHtml,
    contBuiltHtml: contBuiltHtml,
    contScss: contScss,
    contBuiltCss: contBuiltCss, // 已编译的样式，当然，有sass存在才会有编译后样式
    contCss: contScss ? '' : contCss, // 如果SCSS存在就忽略CSS（这时的CSS可能是组件上传前编译的）
    contJs: contJs,
    contJson: contJson,
    widget: widget
  }
}
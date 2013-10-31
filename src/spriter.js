/*
    @name: hm-sprite
    @description: implemention of http://csssprites.org/
*/

var path = require('path');
var fs = require('fs');
var PNG = require('pngjs').PNG;

var GrowingPacker = require('./GrowingPacker');

var configParser = require('./config-parser');
var fileHelper = require('./file-helper');
var utilHelper = require('./util-helper');
var styleSheet = require('./stylesheet');
var bgItpreter = require('./bg-interpreter');
var imageHelper = require('./image-helper');


var ignoreNetworkRegexp = /^(https?|ftp):\/\//i;
var ignorePositionRegexp = /right|center|bottom/i;
var imageRegexp = /\(['"]?(.+\.(png|jpg|jpeg))(\?.*?)?['"]?\)/i; // gif取第一帧合入

// TODO： repeat-x会横向扩展合进图片，其余repeat忽略
var ignoreRepeatRegexp = /^(repeat-x|repeat-y|repeat)$/i;


var config;
var sprites;

var collectStyleRules = function (styleSheet, result) {
    var cssRules = styleSheet.cssRules;

    if (cssRules.length > 0) {
        result = result || { length: 0 };

        for (var i = 0; i < cssRules.length; i++) {
            var rule = cssRules[i];

            // @import 样式表
            if (rule.href && rule.styleSheet) {
                rule.styleSheet = styleSheet.getStyleSheet(rule.href);
                collectStyleRules(rule.styleSheet, result);
                continue;
            }
            else if (rule.cssRules && rule.cssRules.length) {
                // 有子样式，比如@media, @keyframes，递归收集
                collectStyleRules(rule, result);
                continue;
            }

            style = rule.style;
            if (!style) {
                // 有可能 `@media`  等中没有 样式， 如： `@media xxx {}`
                continue;
            };

            if (style['background-size']) {
                // 跳过有background-size的样式
                // 因为backgrond-size不能简写在background里面，而且拆分background之后再组装的话
                // background就变成再background-size后面了，会导致background-size被background覆盖
                continue;
            }
            if (style.background) {
                // 有 background 就先拆分
                bgItpreter.split(style);
            }
            // background 定位是 right center bottom 的图片不合并
            if (ignorePositionRegexp.test(style['background-position-x']) ||
                ignorePositionRegexp.test(style['background-position-y'])) {
                bgItpreter.merge(style);
                continue;
            }
            // 显式的使用了平铺的， 也不合并
            // TODO, 单独合并repeat-x和repeat-y的
            if (ignoreRepeatRegexp.test(style['background-repeat']) ||
                ignoreRepeatRegexp.test(style['background-repeat-x']) ||
                ignoreRepeatRegexp.test(style['background-repeat-y'])) {
                bgItpreter.merge(style);
                continue;
            }

            // 有背景图片, 就抽取并合并
            if (style['background-image'] &&
                style['background-image'].indexOf(',') == -1 && //忽略掉多背景的属性
                (imageUrl = getImageUrl(style['background-image']))
            ) {
                // 遇到写绝对路径的图片就跳过
                if (ignoreNetworkRegexp.test(imageUrl)) {
                    // 这里直接返回了, 因为一个style里面是不会同时存在两个background-image的
                    continue;
                }
                imagePath = path.join(config.input, imageUrl);
                if (!fs.existsSync(imagePath)) {
                    // 容错： 如果这个图片是不存在的, 就直接返回
                    continue;
                }
                // 把用了同一个文件的样式汇集在一起
                if (!result[imageUrl]) {
                    result[imageUrl] = {
                        url: imageUrl,
                        cssRules: []
                    };
                    result.length++;
                }
                result[imageUrl].cssRules.push(style);
            }
        }
        return result;
    }
}

var getImageUrl = function (backgroundImage) {
    var imgs = backgroundImage.match(imageRegexp);
    if (imgs) {
        return imgs[1];
    }
    return null;
}

var positionImages = function (styleObjList) {
    debugger;
    var styleObjArr = [],
        arr = [],
        existArr = [],
        styleObj,
        maxSize = 0,
        packer = new GrowingPacker();

    // 把已经合并了并已输出的图片先排除掉
    for (var i in styleObjList) {
        styleObj = styleObjList[i];
        if (styleObj.imageInfo.hasDrew) {
            existArr.push(styleObj);
        } else {
            arr.push(styleObj);
        }
    }
    // console.log(arr);
    // 如果限制了输出图片的大小, 则进行分组
    if (maxSize) {
        //限制图片大小的算法是:
        //1. 先把图片按从大到小排序
        //2. 顺序叠加图片 size , 超过maxSize 时, 另起一个数组
        //3. 最终把一个数组, 拆成 N 个 总 szie 小于 maxSize 的数组
        arr.sort(function (a, b) {
            return b.imageInfo.size - a.imageInfo.size;
        });

        console.log(arr.length, ' : arr length');

        var total = 0,
            ret = [];

        for (var i = 0; styleObj = arr[i]; i++) {
            total += styleObj.imageInfo.size;

             console.log(styleObj.url, total);

            if (total > maxSize) {
                // console.log('--------------');
                if (ret.length) {
                    styleObjArr.push(ret);
                    ret = [];
                    total = styleObj.imageInfo.size;
                }
            }
            ret.push(styleObj);
        }
        if (ret.length) {
            styleObjArr.push(ret);
        }
        // console.log(styleObjArr.length, styleObjArr);
        // console.log('-------------------------------');
    } else {
        styleObjArr.push(arr);
    }
    //packer 算法需要把最大的一个放在首位...
    //排序算法会对结果造成比较大的影响
    for (var j = 0; arr = styleObjArr[j]; j++) {
        arr.sort(function (a, b) {
            return b.w * b.h - a.w * a.h;
        });
        //packer 定位
        packer.fit(arr);
        arr.root = packer.root;
    }
    if (existArr.length) {
        styleObjArr.push(existArr);
    }
    // console.log(styleObjArr.length, styleObjArr);
    // console.log('-------------------------------');
    return styleObjArr;
}


var drawImageAndPositionBackground = function (styleObjArr, cssFileName) {
    // console.log(styleObjArr.length, cssFileName);
    var imageInfo,
        length = styleObjArr.length;

    if (!styleObjArr[length - 1].root) {
        // 若最后一个元素, 没有root 属性, 表示它的样式都是复用已合并的图片的, 直接替换样式即可
        var arr = styleObjArr.pop();
        length = styleObjArr.length;
        for (var j = 0, styleObj; styleObj = arr[j]; j++) {
            imageInfo = styleObj.imageInfo;
            styleObj.fit = imageInfo.fit;
            replaceAndPositionBackground(imageInfo.imageName, styleObj);
        }
    }
    console.log(styleObjArr.length, cssFileName);

    //debugger;

    utilHelper.forEach(styleObjArr, function (i, arr, next) {
        // console.log(i);
        // console.log('-------------------------------');
        var imageResult = createPng(arr.root.w, arr.root.h);

        var imageName = '';

        utilHelper.forEach(arr, function (j, styleObj, goon) {
            var imageInfo = styleObj.imageInfo;

            imageName = getImageName(styleObj.url, i, length)

            replaceAndPositionBackground(imageName, styleObj);

            imageInfo.fit = styleObj.fit;
            imageInfo.hasDrew = true;
            imageInfo.imageName = imageName;

            debugger

            var image = imageInfo.image;
            //对图片进行定位和填充
            image.bitblt(imageResult, 0, 0, image.width, image.height,
                imageInfo.fit.x, imageInfo.fit.y);
            goon();
        }, function (count) {
            //没必要输出一张空白图片
            debugger;

            if (count > 0) {
                imageName = cssFileName.split('.')[0] + '_sprite.png';


                fileHelper.mkdirsSync(path.dirname(imageName));

                imageResult.pack().pipe(fs.createWriteStream(imageName));
                console.log('>>output image:', imageName);
            }
            next();
        });
    });

}

var createPng = function (width, height) {
    var png = new PNG({
        width: width,
        height: height/*,
        deflateLevel: 0,
        deflateStrategy: 4*/
    });
    //先把所有元素至空, 防止污染
    for (var y = 0; y < png.height; y++) {
        for (var x = 0; x < png.width; x++) {
            var idx = (png.width * y + x) << 2;

            png.data[idx] = 0;
            png.data[idx + 1] = 0;
            png.data[idx + 2] = 0;

            png.data[idx + 3] = 0;
        }
    }
    return png;
}

var getImageName = function (cssFileName, index, total) {
    // console.log(cssFileName, index, total);
    var name = '';
    if (cssFileName) {
        var basename = path.basename(cssFileName);
        var extname = path.extname(basename);
        name = basename.replace(extname, '');
    }

    if (!name) {
        name = 'all';
    }


    return config.imageOutput + name + '.png';
}

var replaceAndPositionBackground = function (imageUrl, styleObj) {
    for (var i = 0, rule; rule = styleObj.cssRules[i]; i++) {
        rule['background-image'] = 'url(' + imageUrl + ')';
        //set background-position-x
        setPxValue(rule, 'background-position-x', styleObj.fit.x);

        //set background-position-y
        setPxValue(rule, 'background-position-y', styleObj.fit.y);

        //mergeBackgound, 合并 background 属性, 用于减少代码量
        bgItpreter.merge(rule);
        // console.log(rule);
    };
}

/**
 * 调整 样式规则的像素值, 如果原来就有值, 则在原来的基础上变更
 */
var setPxValue = function (rule, attr, newValue) {
    var value;
    if (rule[attr]) {
        value = parseInt(rule[attr]);
    } else {
        value = 0;
        rule[rule.length++] = attr;
    }
    value = value - newValue;
    value = value ? value + 'px' : '0';
    rule[attr] = value;
}

exports.run = function (options) {
    config = configParser.parse(options);

    var input = config.input;
    var output = config.output;
    var imageOutput = config.imageOutput;

    var fileList = fileHelper.listFilesSync(input, 'css');

    if (!fileList.length) {
        console.log('there is no file in ' + config.input);
        return;
    }

    var cssObjects = [];
    var spriteImages = [];
    var stylesheets = [];
    var combinedStyleObjList = { length: 0 };

    utilHelper.forEach(
        fileList,
        function (i, fileName, next) {
            var css = {
                fileName: fileName
            };

            var filePath = path.join(input, fileName)

            css.styleSheet = styleSheet.getStyleSheet(filePath);
            css.cssRules = styleSheet.getCssRules(filePath);

            var content = styleSheet.read(filePath);

            // 获取是否新增sprite-image

            var styleObjList = collectStyleRules(css.styleSheet);

            if (!styleObjList.length) {
                return next();
            }

            delete styleObjList.length;

            // 合并，推入当前css文件内容
            imageHelper.read(config, styleObjList, function () {
                var styleObjArr = positionImages(styleObjList);
                debugger
                //输出合并的图片 并修改样式表里面的background
                drawImageAndPositionBackground(styleObjArr, fileName);

                //输出修改后的样式表

                styleSheet.write(css, './test/output/');
                next();
            });
        },
        function () {
            // 合并图片
            //delete combinedStyleObjList.length;
            //console.log('--------------');
            //imageHelper.read(config, combinedStyleObjList, function () {

            //    debugger

            //    //对图片进行坐标定位
            //    var styleObjArr = positionImages(combinedStyleObjList);

            //    drawImageAndPositionBackground(styleObjArr, '');
            //});
        }
    );

}

exports.run('./test/config.json');
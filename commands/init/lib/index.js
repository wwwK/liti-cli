"use strict";
const Command = require("@liti/command");
const log = require("@liti/log");
const Package = require("@liti/package");
const utils = require("@liti/utils");
const constants = require("@liti/constants");
const userHome = require('user-home');
const path = require('path');
const inquirer = require("inquirer");
const fs = require("fs");
const fse = require("fs-extra");
const semver = require("semver");
const TYPE_PROJECT = "project";
const TYPE_COMPONENT = "component";
const TEMPLATE_TYPE_NORMAL = "normal";
const TEMPLATE_TYPE_CUSTOM = "custom";
const getProjectTemplate = require("./getProjectTemplate");
class InitCommand extends Command {
    constructor(argv) {
        super(argv);
    }
    init() {
        this.projectName = this._argv[0] || "";
        this.force = !!this._argv[1].force;
        log.verbose("", this.projectName, this.force);
    }
    async exec() {
        try {
            console.log("init的业务逻辑");
            //1. 准备阶段
            const projectInfo = await this.prepare();
            if (projectInfo) {
                 //2. 下载模板
                // console.log(projectInfo)
                this.projectInfo = projectInfo;
                await this.downloadTemplate();
                //3. 安装模板
                await this.installTemplate();
            }
        } catch (e) {
            log.error(e.message);
        }
    }
    async prepare() {
        // 0. 判断模板是否存在， 不存在时，清空模板没有意义
        const template = await getProjectTemplate();
        // log.verbose("后台template", template);
        if (!template || template.length === 0) {
            throw new Error("项目模板不存在");
        }
        this.template = template;
        const localPath = process.cwd();
        // 1. 判断当前目录是否为空，询问是否继续执行
        if (!this.isDirEmpty(localPath)) {
            let ifContinue = false;
            // 询问是否继续创建
            if (!this.force) {
                // 询问是否继续创建
                ifContinue = (
                    await inquirer.prompt({
                        type: "confirm",
                        name: "ifContinue",
                        message: "当前文件夹不为空，是否继续创建项目？",
                    })
                ).ifContinue;
                // 选择否时，终止流程
                if (!ifContinue) {
                    return;
                }
            }
            // 2. 是否启动强制更新
            if (ifContinue || this.force) {
                // 给用户做二次确认
                const { confirmDelete } = await inquirer.prompt({
                    type: "confirm",
                    name: "confirmDelete",
                    message: "是否确认清空当前目录下的文件？",
                });
                if (confirmDelete) {
                    // 清空当前目录, 并不会删除此目录
                    fse.emptyDirSync(localPath);
                }
            }
        }
        // 3. 选择创建项目或组件
        // 4. 获取项目/组件的基本信息
        return this.getProjectInfo();
    }
    async getProjectInfo() {
        let projectInfo = {};
        // 1. 选择创建项目或组件
        const { type } = await inquirer.prompt({
            type: "list",
            name: "type",
            message: "请选择初始化类型",
            default: TYPE_PROJECT,
            choices: [
                {
                    name: "项目",
                    value: TYPE_PROJECT,
                },
                {
                    name: "组件",
                    value: TYPE_COMPONENT,
                },
            ],
        });
        log.verbose("type", type);
        // 2. 获取项目/组件的基本信息
        if (type === TYPE_PROJECT) {
            const project = await inquirer.prompt([
                {
                    type: "input",
                    name: "projectName",
                    message: "请输入项目名称",
                    default: "",
                    validate: function (v) {
                        const done = this.async();
                        setTimeout(function () {
                            // 1. 输入的首字符必须为英文字母
                            // 2. 尾字符必须为英文或数字，不能为字符
                            // 3. 字符允许"-_"
                            // 合法: a, a-b, a_b, a-b-c, a-b1-c1,a_b1_c1a1,a1,a1-b1-c1, a1_b1_c1
                            // 不合法: 1,a_,a-.a_1,a-1
                            const reg =
                                /^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/;
                            if (!reg.test(v)) {
                                done("请输入合法的项目名称");
                                return;
                            }
                            done(null, true);
                        }, 0);
                    },
                    filter: function (v) {
                        return v;
                    },
                },
                {
                    type: "input",
                    name: "projectVersion",
                    message: "请输入项目版本号",
                    default: "1.0.0",
                    validate: function (v) {
                        // 用于输入不合法得内容时，提示错误信息
                        const done = this.async();
                        setTimeout(function () {
                            if (!!!semver.valid(v)) {
                                done("请输入合法的版本号");
                                return;
                            }
                            done(null, true);
                        }, 0);
                    },
                    filter: function (v) {
                        if (semver.valid(v)) {
                            return semver.valid(v);
                        } else {
                            return v;
                        }
                    },
                },
                {
                    type: 'list',
                    name: 'projectTemplate',
                    message: '请选择项目模板',
                    choices: this.createTemplateChoise() 
                }
            ]);
            projectInfo = {
                type,
                ...project,
            };
        } else if (type === TYPE_COMPONENT) {
        }
        return projectInfo;
    }
    createTemplateChoise() {
        return this.template.map(temp => ({
            value: temp.npmName,
            name: temp.name
        }))
    }
    async downloadTemplate() {
        // 前置工作
        // 1. 通过项目模板API获取模板信息
        // 1.1 通过egg搭建一套后端系统
        // 1.2 通过npm存储项目模板
        // 1.3 将项目模板信息存储到mongodb数据库中
        // 1.4 通过egg.js获取mongodb中的数据，并通过API返回

        // console.log(this.template, this.projectInfo)
        const { projectTemplate } = this.projectInfo;
        const templateInfo = this.template.find(item => item.npmName === projectTemplate);

        const targetPath = path.resolve(userHome, constants.DEFAULT_CLI_HOME, constants.TEMPLATE_DIR)

        const storeDir = path.resolve(
            userHome,
            constants.DEFAULT_CLI_HOME,
            constants.TEMPLATE_DIR,
            constants.NODE_MODULES
            )
        const {  npmName, version } = templateInfo;
        this.templateInfo = templateInfo;
        const templateNpm = new Package({
            targetPath,
            storeDir,
            packageName: npmName,
            packageVersion: version,
        })
        if(!await templateNpm.exists()) {
            const spinner = utils.spinnerStart('正在下载模板...');
            await utils.sleep()
            try {
                await templateNpm.install()
            } catch(err) {
                throw err
            } finally {
                spinner.stop(true)
                if(templateNpm.exists()) {
                    log.success("模板下载成功")
                }
            }
        } else {
            const spinner = utils.spinnerStart('正在更新模板...');
            await utils.sleep()
            try {
                await templateNpm.update()
            } catch(err) {
                throw err
            } finally {
                spinner.stop(true)
                if(templateNpm.exists()) {
                    log.success("模板更新成功")
                }
            }
        }
        // 赋值到原型上供模板安装时使用
        this.templateNpm = templateNpm
        log.verbose("模板目录", targetPath)
        log.verbose("模板缓存目录", storeDir)
    }
    async installTemplate() {
        // console.log("templateInfo", this.templateInfo)
        if(this.templateInfo) {
            if(!this.templateInfo.type) {
                this.templateInfo.type = TEMPLATE_TYPE_NORMAL
            }
            if(this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
                // 标准安装
                this.installNormalTemplate()
            } else if(this.templateInfo.type === TEMPLATE_TYPE_CUSTOM){
                // 自定义安装
                this.installCustomTemplate()
            } else {
                throw new Error('无法识别项目模板类型')
            }
        } else {
            throw new Error('项目模板信息不存在')
        }
    }
    async installNormalTemplate() {
        let spinner = utils.spinnerStart('正在安装模板');
        await utils.sleep();
        try {
            // 1. 拷贝模板代码 ,将缓存目录下的内容，拷贝到用户执行当前目录中
            // 获取缓存目录
            const templatePath = path.resolve(this.templateNpm.cacheFilePath + '/template')
            // 获取当前目录
            const targetPath = process.cwd()
            
            log.verbose("模板目录", templatePath)
            log.verbose("当前目录", targetPath)
            
            // 确保目录存在，没有则会创建
            fse.ensureDirSync(templatePath)
            fse.ensureDirSync(targetPath)
            // 拷贝
            fse.copySync(templatePath, targetPath)
        } catch (error) {
            throw error
        } finally {
            spinner.stop(true);
            log.success("模板安装成功")
        }
        // 2.
    }
    installCustomTemplate() {
        console.log("安装自定义模板")
    }
    isDirEmpty(localPath) {
        let fileList = fs.readdirSync(localPath);
        // 认为含只有.开头的文件和node_modules得文件夹为空文件夹
        fileList = fileList.filter(
            (file) => !file.startsWith(".") && ["node_modules"].indexOf(file) < 0
        );
        return fileList && fileList.length <= 0;
    }
}

function init(argv) {
    const [name, options, command] = argv;
    // console.log('init', name, options, process.env.CLI_TARGET_PATH)
    return new InitCommand(argv);
}

module.exports = init;

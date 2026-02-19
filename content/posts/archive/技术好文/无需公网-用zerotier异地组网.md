---
title: "无需公网-用zerotier异地组网"
date: 2023-07-19T10:00:00+08:00
draft: false
summary: "在前面的文章中我们讲到利用frp进行内网穿透，但是他的局限在于你需要一台公网服务器。并且对公网服务器的带宽有一定的要求。因此这里我们推荐一款异地组网工具搭建属于自己的虚拟网络，经过授权连接成功之后彼此都在同一网段，可以像在局域网一样..."
categories:
  - "技术好文"
---
在前面的文章中我们讲到利用frp进行内网穿透，但是他的局限在于你需要一台公网服务器。并且对公网服务器的带宽有一定的要求。因此这里我们推荐一款异地组网工具搭建属于自己的虚拟网络，经过授权连接成功之后彼此都在同一网段，可以像在局域网一样互相访问。

异地组网和内网穿透不同在于，内网穿透服务是第三方会分配给你一个域名或者公网 IP，任何人都可以访问

异地组网是需要再访问端和被访问端都安装可以异地组网的软件，比如 `Zerotier`。来组成一个大的局域网。

##  注册账号

首先我们到官网注册一个账号

https://my.zerotier.com/

![image-20230719223715572](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192237299.png)
![image-20230719223737225](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192237320.png)

也可使用 `Google` 或 `Github` 授权登录

在登陆后，会提示创建一个网络

![image-20230719224044999](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192240089.png)

## 创建一个网络

点击创建网络后，会自动创建。我们只需记录对应的id即可

![image-20230719224220314](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192242414.png)

## 下载客户端

和frp一样，需要我们在穿透的设备上面安装客户端。根据自己的电脑设备系统来进行下载并安装

[www.zerotier.com/download/](https://www.zerotier.com/download/)

![image-20230719224419079](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192244375.png)

1. **在Linux中安装**

```shell
curl -s https://install.zerotier.com | sudo bash
```

![image-20230719224904791](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192249487.png)

或者用github中的源码进行编译

```shell
git clone https://hub.njuu.cf/zerotier/ZeroTierOne.git
make
```

Linux环境 加入zerotier局域网

执行下面命令，加入网络

```shell
zerotier-cli join <NETWORK ID>
```

`<NETWORK ID>`就是我们创建网络后获得的网络id

可能会遇到如下报错：

*zerotier-cli: error while loading shared libraries: libssl.so.1.1: cannot open shared object file: No such file or directory*
![image-20230719230758698](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192307786.png)我们只需要将source.list 添加以下内容：

```shell
deb http://download.zerotier.com/debian/bullseye bullseye main
```

之后更新下就好了

 **Linux下的其他命令**

```shell
# 加入
zerotier-cli join <NETWORK ID>
# 离开
zerotier-cli leave <NETWORK ID>
# 查看计算机连接的网络列表
zerotier-cli listnetworks
# 查看已连接的对等方(如需要连接其它局域网设备，建议先执行此命令查看IP)
zerotier-cli listpeers
#启动
sudo systemctl start zerotier-one.service
#停止
sudo systemctl stop zerotier-one.service
#打开开机自启
systemctl enable zerotier-one.service
#关闭开机自启
systemctl disable zerotier-one.service
```

2. Windows下安装&部署

首先下载Windows客户端并安装

点击客户端 `Join New Network`

![image-20230719225450186](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192254499.png)

填入自己的 <NETWORK ID>

连接成功后，我们在Windows下用ipconfig命令便可以看到用zerotier组网得到的IP地址。

![image-20230719232543342](https://raw.githubusercontent.com/B1ueD0g/Picture/main/img/202307192325586.png)

## 测试

网络连接成功后。设备直接就可以互相访问了

## 不足

当然每款工具都有各自的优点和缺点。它的优点在于无需公网IP就可以实现两台异地的设备之间组网，而且很方便。不足是由于缺少公网IP，其他用户是无法访问你的资源。除非也加入你的局域网。

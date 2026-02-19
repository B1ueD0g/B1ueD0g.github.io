---
title: "做一个永不暴露真实IP的网站"
date: 2024-08-30T15:01:34+08:00
draft: false
summary: "防范DDoS攻击最主要的手段是加钱上高防，同时隐藏网站真实IP"
categories:
  - "技术好文"
---
## 隐藏真实IP

防范[DDoS攻击](https://en.wikipedia.org/wiki/Denial-of-service_attack)最主要的手段是加钱上高防，同时隐藏网站真实IP

而隐藏真实IP的办法个人认为无非就是以下四种：

1. 前端架设反向代理服务器或上cdn。通过代理服务器再访问业务主机，不仅更安全，还可以加速用户访问。另外部署起来也容易，所以不管大中小型网站，都是非常推荐的。
2. 架设防火墙，仅允许白名单ip访问真实主机；不管是自行架设的反向代理服务器还是cdn，基本上都可以拿到ip（段）列表。将这些ip加入白名单，屏蔽其他ip的直接访问，即使外界用zmap、带host扫描也无法探测到。
3. 尽量避免真实业务主机直接发起对外连接；不理解这条的人可以想想以下场景：用户注册激活、找回密码等业务需要发邮件，如果业务主机直接通过smtp方式向外发邮件，绝大部分情况下邮件header中会出现真实ip；将markdown编辑器中用户输入url的图片下载到本地，如果是业务主机直接下载，则能轻易拿到真实ip。诸如类似的情况不少，故而对外请求应该都谨慎。
4. 防止二级域名泄漏。www上了cdn，管理后台的admin、邮件解析的mx没有经过cdn并且解析到业务主机的ip，则以另一种形式泄漏了真实ip。

但是还有一些细节需要注意：

- cdn如果只用了国内的，则可以通过国外主机ping来发现真实ip

- phpinfo、应用程序漏洞可能会泄漏真实ip

- 同一内网主机/虚拟主机沦陷后嗅探到真实ip

既然不想暴露网站的真实IP，那么真实服务器前面至少套一层代理。一般来说，位于最前线的反向代理主要有如下几种：

- **CDN**：内容分发网络，就近为用户提供服务，加速访问
- **高防IP**：高防IP一般位于大带宽的骨干网节点上，用于清洗DDoS流量
- **SLB**：负载均衡器，用在大流量、繁忙的网站上，常见的SLB有LVS、F5等

这三种反向代理主要作用不一样，配置好的情况下都能隐藏服务器真实IP。对于普通的网站，使用CDN或者高防就足够，业务量大的情况下才会用到SLB

下面介绍使用了反向代理的情况下，隐藏网站真实IP的操作

## 防火墙

使用防火墙是最简单的做法，即：将反向代理的回源IP加入白名单，屏蔽其他IP的任何请求

例如使用[CloudFlare](https://www.cloudflare.com/)的免费CDN服务，其回源IP可从 https://www.cloudflare.com/zh-cn/ips/ 获取，然后将其加入白名单，同时屏蔽其他IP：

```bash
# 将cf ip地址放在 cf_ips.txt
# 首先将cf的ip加入白名单
while read -r line
do
  firewall-cmd --zone=trusted --add-source=$line
done < cf_ips.txt
# 然后移除其他ip对http和https服务的访问
firewall-cmd --remove-service=http
firewall-cmd --remove-service=https
```

经过上述设置，Cloudflare 的IP能正常访问，其他IP完全无法访问真实ip的网站服务器，很好的隐藏了真实IP

该方法设置简单，适用于服务器托管单站点的情形。当服务器上托管多个网站，并且某些站点需要直接暴露外网时，这种做法缺乏灵活性，无法实现

*也可以通过Nginx的allow/deny指令达到相同效果*

## IPv6

对于防火墙和网络不熟悉的网友，可以考虑使用IPv6来隐藏网站的真实IP。具体操作为：

1. 找一台有IPv6地址的服务器，只有IPv6的NAT VPS更好。目前IPv6地址正在普及中，许多商家都免费提供IPv6地址，例如一些VPS商家：阿里云、Vultr、Linode、CloudCone，有的还提供不止一个IPv6地址

2. 设置网站只监听IPv6端口。以Nginx为例，网站配置文件形如：

   ```bash
   server {
       listen [::]:80;
       server_name 主机名; # 请改成自己的主机名
   
       return 301 https://主机名$request_uri;
   }
   server {
       listen      [::]:443 ssl http2;
       server_name  主机名;
       ssl_certificate 证书路径;
       ssl_certificate_key ssl密钥路径;
       # 其他设置
   ```

3. 找一家支持只有IPv6的CDN，例如CloudFlare，设置IPv6解析（具体自行Google）

经过上面三步设置，基本上可确保不会泄漏真实IP，原因如下

1. 绝大多数情况下，人们都会理所当然的找IPv4，不会想到你的网站根本不存在IPv4网络上
2. 相对于IPv4，IPv6的地址段实在太庞大。即使有zmap这种几小时扫描完全球ipv4段的神器，或者Shodan搜索引擎，也很难从海量地址中寻找单个地址

如果不放心，可以同样加上防火墙，就万无一失了

```bash
# 首先将cf的ip加入白名单
while read -r line
do
  firewall-cmd --zone=trusted --add-source=$line
done < cf_ips.txt
# 然后屏蔽其他地址对ipv6的访问权限
firewall-cmd --add-rich-rule="rule family='ipv6' source address='::0/0' drop"
```

该方法同样设置简单，以奇招胜出，单台服务器能托管多个网站，并且其他网站可直接暴露不受影响

## CNAME

另一种常见隐藏真实IP方式是使用CNAME，同样无需设置防火墙。其操作如下：

1. CDN回源时使用CNAME方式回源到另一个主机名上。例如itlanyan.com回源的www.abcdexfd.com。需要注意的是，前端域名和源站域名最好不是同一个，防止通过爆破二级域名泄漏真实IP
2. 在源站服务器上设置默认站点，防止通过host方式爆破。由于默认站点只是为了防止SNI方式泄漏真实IP，因此使用自签证书即可

```bash
# 生成密钥
openssl genrsa -out example.key 2048
# 生成证书，期间需要填一些信息
openssl req -new -x509 -days 3650 -key example.key -out example.pem
```

接着以Nginx为例，设置默认站点：

```bash
server {
  listen 80 default_server;
  server_name example.com;
  return 301 https://example.com$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com default_server;
  ssl_certificate example.pem;
  ssl_certificate_key example.key;
}
```

然后重启Nginx即可

该方法无需设置防火墙，设置较为简单，但是需要额外一个域名

## 注意事项

以上操作只能让他人在明面上无法直接访问真实服务器，但请仔细阅读隐藏真实 IP 中的建议，防止有发送邮件、WordPress pingback等隐式暴露IP的行为

## 遇到DDoS怎么办?

如果域名之前从未用过，一出道就用上面提到的方法，基本上可以保证不会泄漏网站的真实IP

但是不泄漏真实IP不代表不会被DDoS)或者CC攻击，遇到DDoS怎么办？解决办法主要有：

1. 加钱上高防保平安
2. DNS解析域名到127.0.0.1保平安
3. 关机保平安

请根据实际情况和业务需求采取相应措施

---
title: "树莓派刷Kali全配置过程"
date: 2025-07-10T10:00:00+08:00
draft: false
summary: "本指南详细介绍如何在**树莓派 5**上以**无显示屏 (headless)** 方式部署 **Kali Linux (XFCE 桌面环境)**，并使用 **FRP (Fast Reverse Proxy)** 实现远程访问。内容涵..."
categories:
  - "技术好文"
---
本指南详细介绍如何在**树莓派 5**上以**无显示屏 (headless)** 方式部署 **Kali Linux (XFCE 桌面环境)**，并使用 **FRP (Fast Reverse Proxy)** 实现远程访问。内容涵盖从准备镜像、烧录 TF 卡、系统初始化配置，到安装常用工具、设置图形界面和 VNC 服务，以及通过 FRP 进行内网穿透远程连接的完整步骤。所有操作均针对无屏幕环境设计，并提供清晰的命令行示例（含注释）和配置文件示例。

## 涉及工具介绍

### 硬件工具清单

1. [树莓派5-16G版](https://www.raspberrypi.com/products/raspberry-pi-5/)
   1. 树莓派5官方产品简介：https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf
   2. 树莓派5机械模组&接口图纸：https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf
   3. 树莓派5官网入门文档：https://www.raspberrypi.com/documentation/computers/raspberry-pi.html
2. 树莓派5铝合金CNC超薄外壳-带风扇版（请自行淘宝搜索购买）
3. 官方PD充电器（Raspberry Pi 5 的性能比 Raspberry Pi 4 更高，使用功率不足的电源可能会遇到问题。故推荐使用高质量的 5V 5A USB-C 电源）
4. TF卡-U3V30A2（64GB及以上）
5. 读卡器

### 软件工具清单

1. Kali官方镜像：https://kali.download/arm-images/kali-2025.2/kali-linux-2025.2-raspberry-pi-arm64.img.xz
2. 树莓派官方启动盘制作工具：https://downloads.raspberrypi.org/imager/
3. VNC工具：https://www.realvnc.com/en/connect/download/viewer/（笔者个人推荐）
4. FRP：https://github.com/fatedier/frp



## 1. 准备 Kali 树莓派镜像与 TF 卡烧录

**下载镜像：** 前往 Kali Linux 官方网站获取适用于树莓派的最新ARM64镜像文件。例如，我们使用 **kali-linux-2025.2-raspberry-pi-arm64.img.xz** 镜像，它已包含 XFCE 桌面环境并支持树莓派 5 硬件。建议使用**64GB或更大容量**的高速 microSD **TF 卡**来容纳完整的系统和工具集。下载镜像后，可验证其 SHA256 校验值以确保文件完整无误。

**准备烧录工具：** 安装 Raspberry Pi 官方提供的镜像写入工具 **Raspberry Pi Imager**（支持 Windows、macOS、Linux）。我们也可以使用 Balena Etcher 等工具或命令行 dd 进行烧录，但 Raspberry Pi Imager 提供了方便的预配置选项。

**烧录镜像到 TF 卡：**

- 将 TF 卡插入读卡器并连接电脑。确保备份卡内重要数据或使用全新卡。
- 打开 Raspberry Pi Imager，点击 “选择操作系统 (Choose OS)” 按钮。在列表中找到 **“Kali Linux”**（在 “Other specific purpose OS” 即可找到） 。选择与树莓派 5 硬件架构匹配的 64 位 Kali Linux 镜像。或在“使用自定义镜像”中上传已下载好的镜像。
- 点击 “选择存储 (Choose Storage)” 并选择目标 TF 卡。 （千万小心检查这一步骤，不要刷错哦！！！）
- **（可选）预先格式化**：如遇到写入错误，可先用 SD Card Formatter 等工具将 TF 卡完整格式化为 FAT32/exFAT 格式 。

在点击“写入”前，我们可以通过 Raspberry Pi Imager 的**高级选项**对系统进行预配置，以便实现开机无头登录。



## 2. 使用 Raspberry Pi Imager 写入镜像并配置预设选项

**打开高级配置：** 在 Raspberry Pi Imager 中，选择好镜像和存储设备后，点击窗口中的齿轮图标 (或使用快捷键 **Ctrl+Shift+X**) 打开高级选项菜单。Raspberry Pi Imager 提供了一系列预设配置项，方便我们在烧录时写入系统配置 ：

![image-20250710223232323](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507102240181.png)

- **启用 SSH：** 在“服务”中勾选 “Enable SSH”，选择允许使用密码验证登陆。这样系统首次启动时将自动开启SSH服务。
![image-20250710223212345](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507102242706.png)
- **设置主机名：** 在 “Set hostname” 中输入系统主机名，例如 kali-pi，便于在局域网内通过名称访问树莓派。
- **设置默认用户名/密码：** 填写默认账户（例如用户名 kali）和密码（例如 kali）。Kali 默认用户名/密码即为 kali/kali 。若使用自定义用户名，注意Kali镜像可能会自动存在 kali 用户，可保持默认以简化流程。
- **配置 Wi-Fi：** 填写 Wi-Fi 网络的 SSID（无线名称）和密码，选择 Wi-Fi 国家/地区代码。国家代码很重要，需与你的Wi-Fi所在地匹配（例如在中国可填 **CN**）。这将生成 Wi-Fi 配置，以便树莓派启动时自动连接无线网络。
- **区域和本地化：** 设置本地语言和键盘，键盘布局选择 **“us”**（英文），时区选择 **“Asia/Shanghai”** 或相应时区。正确的区域设置有助于系统显示中文并使用正确的键盘布局。
![image-20250710223159693](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507102240711.png)

配置完成后，点击“保存”，然后点击“写入”开始烧录镜像并应用上述预设选项。

> **注意：** 根据社区经验，Kali Linux 官方镜像**不完全支持** Raspberry Pi Imager 的自动预配置功能 。这意味着即使在 Imager 中设置了 SSH 和 Wi-Fi，首次启动后未必生效。为确保无显示器情况下能够远程连接，我们可以采取**手动方式**辅助配置SSH和Wi-Fi（见下文）。

**等待写入完成：** 烧录过程可能需数分钟到十几分钟。完成后 Imager 会验证写入结果。烧录成功后，先不要急于取出卡，我们还需进行一些手动配置（特别是确保 SSH 启用和 Wi-Fi 配置正确）。

![image-20250710224339976](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507102243001.png)

## 3. 首次启动前的手动配置（启用 SSH 和 Wi-Fi）

由于 Kali Linux 镜像在首次启动时**默认关闭 SSH**且**无法通过 Raspberry Pi Imager 自动配置 Wi-Fi** ，建议在插入树莓派并开机前，执行以下**手动配置**以确保系统能够连入网络并允许SSH登录：

- **挂载分区：** 烧录完成后，电脑上会出现两个新分区：一个名为 **boot** 的引导分区（FAT32），另一个是 Linux 根文件系统分区（ext4，Windows 下可能不可见）。我们主要操作 **boot** 分区，也就是 /boot 分区。
- **启用 SSH：** 在 **boot** 分区根目录下创建一个名为 ssh 的空文件（无扩展名）。这会在系统首次引导时触发 Kali 启用SSH服务 。在Windows下可新建一个文本文件并命名为“ssh”（确保无.txt后缀）。在Linux/macOS下可以执行命令（假设boot挂载在 /mnt/boot）：

  ```bash
  # 在boot分区创建空的ssh文件以启用SSH
  sudo touch /mnt/boot/ssh
  ```

- **配置 Wi-Fi：** 如果需要让树莓派通过Wi-Fi联网，在 **boot** 分区根目录创建一个 wpa_supplicant.conf 文件，并填入无线网络配置。文件内容格式如下（请根据实际Wi-Fi信息修改）：

  ```bash
  ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
  update_config=1
  country=CN  # 将CN改为你的国家代码，如 US, UK 等
  
  network={
      ssid="Your_WiFi_SSID"        # Wi-Fi 名称
      psk="Your_WiFi_Password"     # Wi-Fi 密码
      key_mgmt=WPA-PSK             # 加密类型，WPA2 常用 WPA-PSK
  }
  ```

- 将上述内容中的 Your_WiFi_SSID 和 Your_WiFi_Password 替换为实际的无线网络名称和密码。保存时注意确保文件名为 **wpa_supplicant.conf**（不要有.txt扩展名）。Kali 在引导时通常会将此配置文件移动到 /etc/wpa_supplicant/ 并用于连接 Wi-Fi。

完成以上步骤后，弹出并取出 TF 卡。将卡插入树莓派 5，连接电源开机。等待约1-2分钟让系统完成首次启动配置。

同时这里建议，在自己的路由器中，完成DHCP静态IP分配。

![image-20250711111216799](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111112831.png)

## 4. 首次启动与 SSH 远程登录 Kali

树莓派加电启动后，会依据上一步配置尝试连接 Wi-Fi 并启用 SSH 服务。接下来，我们需要在另一台电脑上通过SSH登录进树莓派的 Kali 系统：

- **查找树莓派 IP 地址：** 无显示屏环境下获取设备 IP 是首要挑战。你可以登录路由器的管理界面查询新连接的设备（根据主机名 kali-pi 或查看新增的 DHCP 列表），或者使用局域网扫描工具如 nmap 扫描网段以找到开放的22端口的主机 。另一个方法是使用 mDNS 主机名（如果网络支持），尝试直接 SSH 连接 kali-pi.local（前提是网络内DNS解析或电脑安装了 Bonjour 服务）。
- **使用SSH连接：** 在终端或命令提示符执行（将 <IP> 替换为实际树莓派IP地址）：

  ```bash
  ssh kali@<IP>
  ```

- 如果使用了我们预设的用户名/密码（或 Kali 默认 kali/kali），会提示输入密码进行登录 。首次连接需接受主机密钥。

- **更换密码：** 初次登录后，出于安全考虑请及时修改默认账户的密码：

  ```bash
  sudo passwd kali
  ```
  
  - 按提示输入新密码。
  
  至此，你已经通过SSH成功登录到了树莓派上的 Kali 系统。接下来可以进行系统配置和软件安装。
  
  > **提示：** 如果此时无法SSH连接树莓派，请参考文末[常见问题排查](#9-常见问题与排查建议)章节。常见原因包括SSH未成功启用、Wi-Fi未连接等，可通过有线网络连接或重新配置上述文件进行修复。

## 5. 更换软件源为国内镜像 (提高更新速度)

Kali Linux 默认软件源在国外服务器，在国内直接更新可能较慢甚至失败。我们可以将软件源切换为国内镜像源（如清华大学开源镜像站）以提升速度 。操作步骤：

1. **备份源列表：** 编辑源列表文件前，建议备份原文件：

   ```bash
   sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak
   ```

2. **编辑 /etc/apt/sources.list：** 使用 vim、nano 等编辑器打开该文件，注释掉原有的官方源行，在文件顶部添加国内源地址。例如添加清华大学的 Kali 镜像源：

   ```bash
   sudo nano /etc/apt/sources.list
   ```

   ```bash
   # 中科大源、阿里源等亦可使用，这里以清华TUNA源为例
   # 清华大学 Kali 镜像源
   deb https://mirrors.tuna.tsinghua.edu.cn/kali kali-rolling main contrib non-free non-free-firmware
   deb-src https://mirrors.tuna.tsinghua.edu.cn/kali kali-rolling main contrib non-free non-free-firmware
   ```

3. 上述两行分别指定了二进制软件包源和源码源的地址。其中 kali-rolling 是 Kali 的滚动更新分支，包含 **main**（主）、**contrib**（贡献）、**non-free**（非自由）及 **non-free-firmware**（非自由固件）组件。确保根据实际需要包含所有组件，以免缺少驱动或工具。

4. **更新 APT 密钥（若有需要）：** 如果更换源后运行更新出现 **公钥无效** 等错误，可执行以下命令导入 Kali 官方仓库公钥

   ```bash
   sudo wget -q -O - https://archive.kali.org/archive-key.asc | sudo apt-key add -
   ```

   然后重新运行更新命令，修改完成后保存退出编辑器。

## 6. 更新系统并升级软件包

更换源后，首先执行系统更新，确保安装最新补丁和索引：
  ```bash
  # 更新软件包索引
  sudo apt update -y
  # 升级已安装的软件包
  sudo apt -y full-upgrade -y
  ```
上述命令将刷新APT包列表并应用所有可用升级。 ￼在 Kali (Debian) 中，建议使用 full-upgrade（或 dist-upgrade）以处理可能的依赖变更。过程可能需要一些时间，尤其如果镜像版本不是最新。耐心等待完成，期间如果遇到提示，可按 Y 确认或 q 跳过查看更详细信息。

系统升级完毕后，建议重启一次树莓派（sudo reboot），以确保内核等更新生效。重启后重新通过SSH登录继续后续步骤。

## 7. 安装 kali-linux-everything 工具集

Kali Linux 提供了多个工具集元包，其中 **kali-linux-everything** 包含了 Kali 下“几乎所有”工具。 在有足够存储空间和带宽的情况下，我们可以一键安装这个工具集，以便在树莓派上具备完整的渗透测试工具

  ```bash
  sudo apt install -y kali-linux-everything
  ```
| **版本名称**            | **简要说明**                                   | **使用场景**                             |
| ----------------------- | ---------------------------------------------- | ---------------------------------------- |
| **Installer / Default** | 标准安装版，仅含基础系统和常用渗透测试工具     | 通用渗透测试环境，适合联网更新           |
| **Live ISO**            | 可启动运行，无需安装（含 GUI 与部分工具）      | 临时测试、U盘随身系统、取证              |
| **Netinst**             | 最小化安装，需联网拉取组件                     | 高度定制化安装，适合轻量虚拟机或自动部署 |
| **Large**               | 包含绝大多数主流 Kali 工具的安装包             | 渗透测试者常用，部署后几乎无需额外安装   |
| **Everything**          | 包含 Kali 仓库中**所有工具**，安装镜像达 20GB+ | 离线环境部署、大型靶场、完全工具链准备   |

| **功能模块**                   | **Default/Installer** | **Large**     | **Everything** |
| ------------------------------ | --------------------- | ------------- | -------------- |
| kali-linux-default 工具集      | ✅                     | ✅             | ✅              |
| top10, wireless, web等分类工具 | ⛔️（手动安装）         | ✅（包含多数） | ✅（全部）      |
| 所有 Kali 元包（metapackage）  | ⛔️                     | 部分          | ✅ 全部         |
| 工具总数（粗略估计）           | 100–200               | 300–400       | 600+           |

该命令可能下载数GB的数据（完整安装体积可能超过20GB），请确保网络稳定且TF卡剩余空间充足（安装64GB或更大容量卡的原因所在）。根据网络速度，此过程可能持续较长时间。安装过程中APT会自动处理依赖关系并配置软件，如有交互提示，按默认或根据需要选择。

完成后，树莓派上的 Kali 将拥有完整的工具集，为各种安全测试做好准备。

## 8. 配置图形界面和 VNC 服务 (远程桌面)

在无显示屏情况下，我们仍可能需要使用 Kali 的图形桌面（XFCE）运行某些工具或获取完整桌面体验。为此，我们将配置系统在引导时启动图形界面，并通过 **VNC** 实现远程桌面访问。

### 8.1 设置默认启动进入图形界面

Kali Linux 树莓派镜像默认可能**启动到文本控制台**以节省资源。若希望系统启动后即进入 XFCE 桌面环境，我们需要调整系统target为图形模式：

  ```bash
  # 将系统默认运行级别设置为图形界面
  sudo systemctl set-default graphical.target
  ```

执行上述命令后，系统默认将尝试启动显示管理器 (例如 LightDM) 进入图形界面。由于我们是无头环境，如果树莓派未连接显示器，默认情况下 X 服务器可能无法实际显示界面。不过我们仍可通过 VNC 来创建虚拟显示。

> **注意：** 如果树莓派始终无物理显示器，graphical.target 虽会启动桌面服务，但没有HDMI连接时可能不会创建默认 :0 显示输出。后续我们通过 VNC 虚拟桌面解决这一问题。如果将来需要连接显示器进行本地操作，可保持该设置方便直接进入桌面。

### 8.2 安装 TigerVNC 服务

**TigerVNC** 是性能良好的 VNC 服务器实现。我们选择它来在树莓派上运行虚拟桌面会话。安装命令：

```bash
sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server tigervnc-common autocutsel
```

- tigervnc-standalone-server 安装 TigerVNC 服务端程序。
- tigervnc-common 提供相关的常用文件。
- autocutsel 工具用于在 VNC会话与本地剪贴板之间同步剪贴板（复制/粘贴）

安装完成后，设置 VNC 访问密码并初始化配置：

```bash
# 切换到普通用户 (如果当前是 root 登录，请切回 kali 用户)
exit            # 确保在 kali 用户下操作

# 设置 VNC 密码（会提示输入密码并确认）
vncpasswd

# 初次启动 VNC 服务（生成配置文件并创建 VNC 会话 :1）
vncserver :1
```

首次运行vncserver :1时，它会要求设置访问密码（长度不超过8位），并可选设置“只读”密码（这里选择 **n**，无需只读密码)  。随后会输出类似信息，表示启动了编号:1的 VNC桌面（对应TCP端口5901）

因为VNC服务启动在5900端口，而我们需要为桌面环境新建一个端口，这里1就是+1，即在5901端口，如果是vncserver :2 就是5902端口，依次类推。

```bash
New 'X' desktop is kali:1
Creating default startup script /home/kali/.vnc/xstartup
Starting applications specified in /home/kali/.vnc/xstartup
Log file is /home/kali/.vnc/kali:1.log
```

这表示 TigerVNC 已在后台启动了一个虚拟桌面会话。默认情况下，这个虚拟桌面可能仅有一个灰色背景和X终端（或可能因为尚未正确配置而退出）。接下来我们进行配置以启动 XFCE 桌面环境。

停止刚才启动的 VNC 会话：

```bash
vncserver -kill :1
```

这将终止会话，以便我们编辑配置文件后重新启动。

### 8.3 配置 VNC 的 XFCE 桌面会话

TigerVNC（以及 TightVNC）默认的启动脚本位于 ~/.vnc/xstartup，首次运行时已生成。我们需要修改它以启动 XFCE4 桌面环境，否则 VNC 连接后可能只看到灰色屏幕和X光标。编辑文件：

```bash
sudo nano ~/.vnc/xstartup
```

将其中内容替换为以下内容： 

```bash
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
startxfce4 &   # 启动 XFCE4 桌面会话
autocutsel -fork  # 启动剪贴板同步
```

上述配置确保每次 VNC 虚拟会话启动时，清除可能的残留会话环境变量，然后后台启动 XFCE4桌面，并运行 autocutsel 以支持剪贴板共享。 保存文件后退出编辑器。

赋予 xstartup 脚本可执行权限：

```bash
sudo chmod +x ~/.vnc/xstartup
```

> **注意：** xstartup 文件权限必须是可执行，否则 TigerVNC 将忽略它，导致无法启动 XFCE 桌面

### 8.4 手动测试 VNC 连接

现在手动启动 VNC 服务，测试能否通过远程桌面访问：

```bash
# 再次启动一个 VNC 会话 :1
vncserver :1 -geometry 1280x800 -depth 24
```

这里指定了分辨率为1280x800，色深24位。你可以根据需要调整 -geometry 参数设置合适的虚拟屏幕分辨率（常见如 1920x1080 、2560×1440等）

启动成功后，在你的PC上使用 VNC Viewer（如 TigerVNC Viewer、RealVNC Viewer 等），连接树莓派的IP和端口好，例如：

```bash
192.168.1.25:5901
```

当出现密码提示时，输入之前设置的 VNC 密码，即可看到 Kali XFCE 桌面环境的画面。此时，你已经在无显示器的树莓派上远程使用图形界面了 

如果连接后出现**灰屏或黑屏**，可能是 xstartup 配置有误或未赋予可执行权限，请返回检查 ~/.vnc/xstartup 内容是否与上文一致且可执行。另外，确保前一步已经先 vncserver -kill 再编辑再启动，否则旧实例不会读取新配置。

```bash
vncserver -kill :1
```

![image-20250711092623134](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507110926182.png)

### 8.5 设置 VNC 服务开机自启

为了在树莓派每次启动时自动开启 VNC 服务（无需手动命令），我们可以设置 systemd 服务来管理 VNC Server。在 Kali 上创建一个新的 systemd 单元文件：

```bash
sudo nano /etc/systemd/system/vncserver@.service
```

填入以下内容并保存：

```bash
[Unit]
Description=Start TightVNC (TigerVNC) server at startup
After=syslog.target network.target

[Service]
Type=forking
User=bluedog
Group=bluedog
WorkingDirectory=/home/bluedog
PIDFile=/home/bluedog/.vnc/%H:%i.pid
ExecStartPre=-/usr/bin/vncserver -kill :%i > /dev/null 2>&1
ExecStart=/usr/bin/vncserver -depth 24 -geometry 1920x1080 :%i
ExecStop=/usr/bin/vncserver -kill :%i

[Install]
WantedBy=multi-user.target
```

以上配置中，用 %i 代表实例号，例如 vncserver@1.service 将 %i 替换为 1，从而启动 :1 会话 。我们设置服务以 kali 用户身份运行，在启动前尝试杀掉残留的 :1 实例，启动时设定分辨率为 1920x1080、色深24位，可根据需要修改。

保存文件后，刷新 systemd 配置并启动、启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl start vncserver@1.service    # 启动 VNC服务实例 :1
sudo systemctl enable vncserver@1.service   # 设置开机自启
```

现在即使树莓派重启，系统启动过程中也会自动开启 VNC 服务，使你随时可以远程连接桌面。 

> **提示：** 默认 VNC 服务监听本地所有接口的 5901 端口，仅在局域网内访问。如果需要通过互联网访问，建议结合下面的 FRP 内网穿透配置，或确保网络环境安全并设置复杂的VNC密码。

### 动态调整vnc的分辨率

默认vnc的客户端不支持动态调整vnc的分辨率适应客户端的屏幕大小。但是可以手动修改。

```bash
xrandr
```

![image-20250711093944551](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507110939624.png)

并且会显示当前支持分辨率。

```bash
xrandr --output VNC-0 --mode 2560x1440
```

执行后就会调整当前vnc窗口的大小为对应分辨率。

## 9. 配置 FRP 实现远程访问 (内网穿透)

在许多实际场景中，树莓派可能位于内网或没有公网IP，无法直接通过互联网连接。我们可以使用 FRP 实现**内网穿透**，将树莓派的SSH和VNC服务映射到公网服务器，从而随时远程访问树莓派。

**FRP (Fast Reverse Proxy)** 由客户端和服务端组成：

- **FRP服务端 (frps)** 部署在具有公网IP或云服务器上，监听来自客户端的连接并开放端口供远程访问。
- **FRP客户端 (frpc)** 部署在树莓派等内网设备上，主动连接 FRP 服务端并将本地服务端口映射出去。

下面假设你已有一台**具有固定公网IP或域名的服务器**可用来充当 FRP 服务端（或使用某云服务器）。我们将使用该服务器做中转，将树莓派的SSH及VNC端口映射出去。

### 9.1 在服务端配置 FRP 服务 (frps)

（如果已有 FRP 服务端运行，可跳过此节。）在云服务器上：

1. **下载 frp：** 从 FRP 官方仓库获取最新版本。可以通过浏览 https://github.com/fatedier/frp/releases 找到最新版本下载链接。例如，这里假设最新版本为v0.61.0，对应 Linux amd64 平台：

   ```bash
   wget https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz
   tar -xzf frp_0.61.0_linux_amd64.tar.gz
   cd frp_0.61.0_linux_amd64
   ```

2. **配置 frps：** 在解压目录下找到 frps.toml（如果不存在就创建）。写入如下配置：

```bash
########################################
#  Fast Reverse Proxy Server (frps)    #                                     
#  位置：阿里云 ECS 4*.**.**.**0         #
########################################

# [common]
# ───────── 基础监听 ─────────
bindAddr = "0.0.0.0"          # 监听所有 IPv4（需要 IPv6 可改 ":::")
bindPort = 7501               # frpc 侧的 serverPort 必须一致，且需要在云服务器上开启对应端口
# ───────── 认证令牌 ─────────
auth.token = "请设置为自己的口令"        # 客户端 auth.token 必须保持相同
# ───────── 域名转发端口 ─────
# 暂未启用域名解析，直接关闭 80/443，避免多开端口
# vhostHTTPPort  = 0
# vhostHTTPSPort = 0
# ───────── 日志配置 ─────────
# logFile    = "/root/frp/frps.log"   # 自定义日志路径
# logLevel   = "info"                 # 可选：trace, debug, info, warn, error
# logMaxDays = 7                      # 日志保留天数
# ───────── 可选：仪表盘 ─────
# dashboardPort = 7501             # Web UI 端口
# dashboardUser = "请设置为自己的用户名"
# dashboardPwd  = "请设置为自己的密码"
# ───────── 可选：TLS 加固 ────
# 如果需要 mTLS，可启用：
# authenticationMethod = "token,tls"
# tlsOnly              = true
# 证书相关字段参见官方示例

subdomainHost = "如有请设置为自己的域名"
```

3. **启动 frps：** 可以直接在前台运行：

```bash
sudo ./frps -c ./frps/frps.toml
```

或将其作为后台服务运行：

```bash
nohup ./frps -c ./frps/frps.toml &>/var/log/frps.log &
```

4. 确保服务器的防火墙开放所需端口（例如 TCP 7000，以及待映射出去的端口，如SSH的6000、VNC的6001等）。

5. **配置 frps 开机自启：** 新建 systemd 服务 /etc/systemd/system/frps.service，写入以下内容：

   ```bash
   [Unit]
   Description=Fast Reverse Proxy Server (frps)
   After=network.target
   
   [Service]
   Type=simple
   ExecStart=/root/frp/frps -c /root/frp/frps.toml               #注意自己的路径！
   Restart=on-failure
   LimitNOFILE=65535
   
   [Install]
   WantedBy=multi-user.target
   ```

   保存后启用服务：

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable frps
   sudo systemctl start frps
   ```

### 9.2 在树莓派配置 FRP 客户端 (frpc)

回到我们的 Kali 树莓派：

1. **下载 frpc：** 根据树莓派架构下载 FRP 客户端的 Linux ARM64 版本。版本需与服务端一致

```bash
cd /tmp
wget https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_arm64.tar.gz
tar xzf frp_0.61.0_linux_arm64.tar.gz
cd frp_0.61.0_linux_arm64
sudo cp frpc /usr/bin/              # 安装frpc可执行文件到路径
sudo cp frpc.toml /etc/frpc/frpc.toml      # 复制默认配置文件到 /etc
```

1. > 上述以v0.61.0为例，请替换为实际最新版号。 解压后我们将 frpc 可执行文件放入 /usr/bin，方便直接运行；将示例配置重命名放入 /etc 便于统一管理。

1. **配置 frpc：** 编辑 /etc/frpc/frpc.toml 文件，根据实际需求修改。如我们希望将树莓派的 SSH (22端口) 和 VNC (5901端口) 映射到服务器对应端口，对应配置可以如下：

```bash
###############################################################################
#  Fast Reverse Proxy Client (frpc)
#  主机：Raspberry Pi Kali — 192.168.**.**(请切换为你自己的IP地址)
###############################################################################

#############################
# frps 连接信息
#############################
serverAddr     = "4*.**.**.**0"   # 阿里云公网 IP
serverPort     = 7501               # frps.bindPort
loginFailExit  = false              # 断线不退出，持续重连

[auth]
  method = "token"
  token  = "请设置为自己的口令"        # 与 frps.token 保持一致

#############################
# 端口映射（TCP）
#############################
[[proxies]]                # SSH
  name       = "kalissh"
  type       = "tcp"
  localIP    = "192.168.**.**"
  localPort  = 22
  remotePort = 5022          # 已在 frps.allowPorts & 安全组开放

[[proxies]]                # VNC
  name       = "kalivnc"
  type       = "tcp"
  localIP    = "127.0.0.1"（这里必须使用回环地址！！！）
  localPort  = 5901
  remotePort = 5901          # 已在 frps.allowPorts & 安全组开放
```

在 [common] 部分填入FRP服务端地址、端口和认证token等公共参数 。然后定义两个隧道：[ssh] 和 [vnc]，分别将本地的 SSH 服务(192.168.*0.**:22)和 VNC 服务(127.0.0.1:5901)通过 FRP 暴露出去。其中 remote_port 指定 FRP 服务端开启的端口号，你可根据需要更改，但要与服务端防火墙配置对应。

3. **配置 frpc 开机自启：** 新建 systemd 服务 /etc/systemd/system/frpc.service，写入以下内容：

```bash
[Unit]
Description=Fast Reverse Proxy Client (frpc)
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/username/frp/frpc -c /home/username/frp/frpc.toml   #注意自己的路径！
Restart=always
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

保存后启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable frpc
sudo systemctl start frpc
```

这样树莓派启动时将自动运行 frpc，并在网络就绪后连接到 FRP 服务器。

4. **验证连接：** 在树莓派上运行 sudo systemctl status frpc 查看日志，确认已成功连上服务端，没有错误。如有问题，可检查 /var/log/syslog 或 /var/log/frpc.log（如果设置了日志输出）。

在服务器上，也可以检查 frps 日志或使用 ss -tnl 确认对应端口已在监听。



5. **远程访问：** 现在，在任何网络环境下，你都可以通过访问**FRP服务器的IP/域名+端口**来管理树莓派：

- SSH 访问：ssh kali@<服务器IP> -p 6000 （通过FRP的5022端口转发到树莓派的22端口）。首次使用时可将此组合加入 ~/.ssh/config 便于快捷连接  。
- VNC 访问：在 VNC Viewer 中连接 <服务器IP>:6001，即通过FRP服务器的6001端口转发到树莓派的5901。输入之前设置的VNC密码，即可远程桌面控制树莓派。

经过 FRP，中间通信会通过我们指定的token验证和（若启用了TLS则）加密传输，确保了一定安全性。为了更安全，建议SSH采用密钥认证并禁用密码登录  等额外加固措施。

现在，无论树莓派位于何处（哪怕在蜂窝网络等受NAT限制的环境），只要 FRP 客户端和服务器保持连接，我们就能随时通过 FRP 隧道远程SSH或VNC访问树莓派上的 Kali 系统了。

## 10.其他软件和折腾

### 10.1 登陆欢迎界面定制

![image-20250711110405304](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111104339.png)

| **组件**                     | **作用**                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| /etc/update-motd.d/*         | 一系列可执行脚本，按数字前缀从小到大依次运行，将输出拼接生成 **动态 MOTD**。 |
| /etc/motd                    | 静态 MOTD 文本。若存在内容，将附加在动态 MOTD 之后。         |
| pam_lastlog.so               | 由 PAM 调用，自动输出 Last login 记录。                      |
| /etc/issue.net + Banner 指令 | SSH 会话横幅。可复用 ASCII Banner，实现本地/远程一致。       |

**文件结构与执行顺序**

```
/etc/update-motd.d/
├── 00-header     # ASCII Banner
├── 10-sysinfo    # 系统状态
└── 20-network    # 网络信息
```

数字前缀决定执行先后；输出顺序即显示顺序。

#### 制作 ASCII Banner

1. **在线生成**
   - 打开 https://patorjk.com/software/taag
   - 输入 *BlueDog* → 选择字体（如 ANSI Shadow）→ Copy
   
2. **本地生成**

```bash
figlet -f slant "BlueDog"
toilet -f big -F metal "BlueDog"
```

将生成的字符画复制备用。

#### 编写 00-header

```bash
sudo tee /etc/update-motd.d/00-header >/dev/null <<'EOF'
#!/bin/bash
clear   # 防止上屏残留

# ---------------- ASCII Banner -----------------
cat <<'BANNER'
 ,---,.    ,--,                                  ,---,                            
  ,'  .'  \ ,--.'|                                .'  .' `\                          
,---.' .' | |  | :             ,--,             ,---.'     \     ,---.               
|   |  |: | :  : '           ,'_ /|             |   |  .`\  |   '   ,'\    ,----._,. 
:   :  :  / |  ' |      .--. |  | :     ,---.   :   : |  '  |  /   /   |  /   /  ' / 
:   |    ;  '  | |    ,'_ /| :  . |    /     \  |   ' '  ;  : .   ; ,. : |   :     | 
|   :     \ |  | :    |  ' | |  . .   /    /  | '   | ;  .  | '   | |: : |   | .\  . 
|   |   . | '  : |__  |  | ' |  | |  .    ' / | |   | :  |  ' '   | .; : .   ; ';  | 
'   :  '; | |  | '.'| :  | : ;  ; |  '   ;   /| '   : | /  ;  |   :    | '   .   . | 
|   |  | ;  ;  :    ; '  :  `--'   \ '   |  / | |   | '` ,/    \   \  /   `---`-'| | 
|   :   /   |  ,   /  :  ,      .-./ |   :    | ;   :  .'       `----'    .'__/\_: | 
|   | ,'     ---`-'    `--`----'      \   \  /  |   ,.'                   |   :    : 
`----'                                 `----'   '---'                      \   \  /  
                                                                            `--`-'   
BANNER

echo "-------------------------------------------------------------------------------------"
EOF
sudo chmod +x /etc/update-motd.d/00-header
```

------

#### 编写 10-sysinfo

```bash
sudo tee /etc/update-motd.d/10-sysinfo >/dev/null <<'EOF'
#!/bin/bash
OS="$(lsb_release -ds)"
KERNEL="$(uname -r)"
MEM_USED="$(free -h --si | awk 'NR==2 {print $3 "/" $2}')"
DISK_ROOT="$(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 ")"}')"
CPU_TEMP="$(vcgencmd measure_temp | cut -d= -f2)"

printf "🖥  系统:  %s  |  内核: %s\n" "$OS" "$KERNEL"
printf "💾  内存:  %s\n" "$MEM_USED"
printf "📦  磁盘:  %s\n" "$DISK_ROOT"
printf "🌡  温度:  %s\n" "$CPU_TEMP"
echo "-------------------------------------------------------------------------------------"
EOF
sudo chmod +x /etc/update-motd.d/10-sysinfo
```

------

#### 编写 20-network

```bash
sudo tee /etc/update-motd.d/20-network >/dev/null <<'EOF'
#!/bin/bash
IP=$(hostname -I | awk '{print $1}')
SSID=$(iwgetid -r 2>/dev/null || echo "离线")

printf "🌐  IP 地址: %s\n" "$IP"
printf "📶  Wi-Fi SSID: %s\n" "$SSID"
echo "-------------------------------------------------------------------------------------"
EOF
sudo chmod +x /etc/update-motd.d/20-network
```

------

#### 清空默认 /etc/motd

```
sudo mv /etc/motd /etc/motd.bak   # 备份
sudo touch /etc/motd              # 创建空文件
```

> 这样保留 Last login，去除 GPL/Warranty 说明。

------

#### SSH 横幅同步（可选）

```bash
sudo cp /etc/update-motd.d/00-header /etc/issue.net
sudo sed -i 's@^#Banner none@Banner /etc/issue.net@' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

------

### 10.2 风扇&变速调控

首先树莓派5度风扇调度是65度才开始转的，没有安装任务和大模型任务的时候基本不转。

并且因为 **gpiozero + RPi.GPIO 尚未全面支持树莓派 5**，因此会在访问 GPIO 时爆出错误

![image-20250711111602896](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111116019.png)

所以我们只能通过 config.txt 中的参数启用 **RP1 控制器的风扇自动调速功能**，原生支持 1~3 个温控档位（温度触发 + PWM 占空比组合）。

**多档温控风扇配置方法（config.txt）**

需要在 /boot/firmware/config.txt（树莓派 5 使用的是该路径）中添加如下配置：

```bash
# 树莓派 5 风扇三档自动调速配置
dtparam=cooling_fan=on

# 档位1：40°C 开始，风扇以 60% 速运行（153/255）
dtparam=fan_temp1=40000,fan_temp1_hyst=5000,fan_temp1_speed=153

# 档位2：50°C 开始，风扇以 80% 速运行（204/255）
dtparam=fan_temp2=50000,fan_temp2_hyst=5000,fan_temp2_speed=204

# 档位3：55°C 开始，风扇全速运行（255/255）
dtparam=fan_temp3=55000,fan_temp3_hyst=5000,fan_temp3_speed=255
```

> 核心机制为：当 CPU 温度超过某一档的温度门槛，就切换到对应速度，**不会回落到低档位，直到温度低到对应滞后门限。**

可额外设置滞后参数（建议设置）：

```bash
dtparam=fan_temp3_hyst=5000   # 第三档降到 50°C 才停
```

### 10.3 Wi-Fi 多网络自动切换设置（家用 + 手机热点）

Kali 默认使用 wpa_supplicant 管理 Wi-Fi。

1. 编辑 Wi-Fi 配置文件：

```bash
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

添加两个网络（按优先级自动切换）：

```bash
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=CN

network={
    ssid="你的家庭WiFi"
    psk="你的家庭密码"
    priority=10
}

network={
    ssid="你的手机热点"
    psk="你的热点密码"
    priority=5
}
```

- priority 数值越大，优先连接；
- 自动连接在可用场景中优选上面的 Wi-Fi。

保存后重启网络服务或直接重启：

```bash
sudo wpa_cli -i wlan0 reconfigure
```



### 10.4 安装输入法

安装Google拼音以及Fcitx

```bash
sudo apt install fcitx fcitx-googlepinyin
```

![image-20250711101408562](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111014623.png)

切换输入法框架

```bash
im-config
```

![image-20250711101523278](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111015335.png)

按照输入法完成后一定要重启系统才能生效．

![image-20250711103900755](https://raw.githubusercontent.com/B1ueD0g/Picture/main/202507111039816.png)

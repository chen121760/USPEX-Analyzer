### 📥 下载与运行说明 / Download & Usage Instructions

本压缩包包含 USPEX-Analyzer 在各个操作系统的运行文件及核心资源包。请在运行前阅读以下说明。

This archive contains the USPEX-Analyzer executables for various operating systems and the core resource package. Please read the instructions below before running the application.

#### ⚠️ 核心要求 / Core Requirement


请将下载的 `.zip` 压缩包完整解压到一个文件夹中。**无论使用哪种操作系统，请务必保证运行文件与 `resources.neu` 文件在同一文件夹内。** 请勿将单独的运行文件（如 .exe）直接拖拽到桌面，否则程序将无法启动。

Please extract the downloaded `.zip` file completely into a folder. **Regardless of your operating system, the executable file must remain in the same folder as the `resources.neu` file.** Do not drag the executable (e.g., .exe) alone to your desktop, otherwise the application will fail to start.

---

#### 💻 Windows 


* 双击运行 `uspex-analyzer-win_x64.exe`。
* 如需桌面快捷方式，请右键点击该 .exe 文件，选择“发送到 -> 桌面快捷方式”。

****
* Double-click `uspex-analyzer-win_x64.exe` to run.
* If you need a desktop shortcut, right-click the .exe file and select "Send to -> Desktop (create shortcut)".



#### 🍎 macOS 


根据你的 Mac 芯片类型，双击运行对应的文件：
* **M系列芯片 (Apple Silicon)**：使用 `uspex-analyzer-mac_arm64`
* **Intel 芯片**：使用 `uspex-analyzer-mac_x64`
* **通用版 (如果不确定)**：使用 `uspex-analyzer-mac_universal`
* *注意：如遇系统提示“未受信任的开发者”拦截，请进入“系统设置 -> 隐私与安全性”中点击“仍要打开”。*

****
Double-click the corresponding file based on your Mac's chip:
* **Apple Silicon (M-series)**: Use `uspex-analyzer-mac_arm64`
* **Intel chips**: Use `uspex-analyzer-mac_x64`
* **Universal (if unsure)**: Use `uspex-analyzer-mac_universal`
* *Note: If blocked by the "unidentified developer" warning, go to "System Settings -> Privacy & Security" and click "Open Anyway".*

---

#### 🐧 Linux 


打开终端，进入解压后的目录。首先赋予执行权限，然后运行：
* **普通 64 位系统**：
    ```bash
    chmod +x uspex-analyzer-linux_x64
    ./uspex-analyzer-linux_x64
    ```
* **ARM 架构 (如服务器或树莓派)**：请根据系统位数选择 `arm64` 或 `armhf`，并执行相同的提权和运行命令。

****
Open a terminal and navigate to the extracted directory. Grant execution permissions first, then run:
* **Standard 64-bit systems**:
    ```bash
    chmod +x uspex-analyzer-linux_x64
    ./uspex-analyzer-linux_x64
    ```
* **ARM architecture (e.g., servers or Raspberry Pi)**: Choose `arm64` or `armhf` based on your system, and apply the same permission and execution commands.
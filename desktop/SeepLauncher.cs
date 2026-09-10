using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace SeepDesktop {
  sealed class ProcessJob : IDisposable {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic BasicLimitInformation;public IO IoInfo;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed; }
    IntPtr handle;
    public ProcessJob() {
      handle=CreateJobObject(IntPtr.Zero,null);
      Extended limits=new Extended(); limits.BasicLimitInformation.LimitFlags=0x2000;
      int size=Marshal.SizeOf(limits);IntPtr memory=Marshal.AllocHGlobal(size);
      try {Marshal.StructureToPtr(limits,memory,false);if(handle==IntPtr.Zero || !SetInformationJobObject(handle,9,memory,(uint)size))throw new Exception("Could not create the process group.");}finally{Marshal.FreeHGlobal(memory);}
    }
    public void Add(Process process) {if(!AssignProcessToJobObject(handle,process.Handle))throw new Exception("Could not attach the bot to its process group.");}
    public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
  }

  static class Program {
    delegate bool WindowCallback(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    static bool RestoreExisting() {
      bool found=false;
      using(var current=Process.GetCurrentProcess()) {
        foreach(var other in Process.GetProcessesByName(current.ProcessName)) {
          using(other) {
            if(other.Id==current.Id)continue;
            try { if(!String.Equals(other.MainModule.FileName,current.MainModule.FileName,StringComparison.OrdinalIgnoreCase))continue; } catch { continue; }
            EnumWindows((window,data)=>{
              uint pid; GetWindowThreadProcessId(window,out pid);
              if(pid!=(uint)other.Id)return true;
              var title=new StringBuilder(256);GetWindowText(window,title,title.Capacity);
              if(title.ToString()!="seep dashboard")return true;
              ShowWindowAsync(window,9);SetForegroundWindow(window);found=true;return false;
            },IntPtr.Zero);
            if(found)return true;
          }
        }
      }
      return false;
    }
    [STAThread] static void Main(string[] args) {
      if(RestoreExisting())return;
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new WebLauncher(args.Contains("--start"), args.Contains("--capture") ? args[Array.IndexOf(args,"--capture")+1] : null));
    }
  }
}

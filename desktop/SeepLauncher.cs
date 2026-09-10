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
    [STAThread] static void Main(string[] args) {
      Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
      Application.Run(new WebLauncher(args.Contains("--start"), args.Contains("--capture") ? args[Array.IndexOf(args,"--capture")+1] : null));
    }
  }
}

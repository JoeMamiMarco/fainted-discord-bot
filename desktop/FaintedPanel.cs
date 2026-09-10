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

namespace FaintedDesktop {
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
      Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
      if(args.Length==2 && args[0]=="--preview"){using(var panel=new Dashboard())panel.Preview(args[1]);return;}
      if(args.Length==2 && args[0]=="--self-test"){using(var panel=new Dashboard())panel.SelfTest(args[1]);return;}
      if(args.Length==2 && args[0]=="--close-test"){using(var panel=new Dashboard())panel.CloseTest(args[1],false);return;}
      if(args.Length==2 && args[0]=="--cancel-test"){using(var panel=new Dashboard())panel.CloseTest(args[1],true);return;}
      string id=BitConverter.ToString(SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(AppDomain.CurrentDomain.BaseDirectory.ToLowerInvariant()))).Replace("-","").Substring(0,20);bool created;
      using(var mutex=new Mutex(true,"Local\\FaintedPanel"+id,out created)){
        if(!created){MessageBox.Show("Fainted's panel is already open.","Fainted");return;}
        Application.Run(new Dashboard());
      }
    }
  }
}

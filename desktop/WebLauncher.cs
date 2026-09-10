using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SeepDesktop {
  sealed class WebLauncher : Form {
    readonly string root=AppDomain.CurrentDomain.BaseDirectory;
    readonly WebView2 view=new WebView2();
    readonly Label status=new Label();
    readonly bool autoStart; readonly string capture;
    Process process; ProcessJob job; bool closing;
    readonly Timer timer=new Timer();
    public WebLauncher(bool start=false,string screenshot=null){
      autoStart=start;capture=screenshot;Text="seep dashboard";ClientSize=new Size(1280,850);MinimumSize=new Size(1000,700);
      StartPosition=FormStartPosition.CenterScreen;BackColor=Color.Black;ForeColor=Color.White;Font=new Font("Segoe UI",10);
      status.Dock=DockStyle.Fill;status.TextAlign=ContentAlignment.MiddleCenter;status.Text="Opening seep dashboard...";Controls.Add(status);
      view.Dock=DockStyle.Fill;view.DefaultBackgroundColor=Color.Black;view.Visible=false;Controls.Add(view);
      Shown+=(s,e)=>Start();timer.Interval=10000;timer.Tick+=(s,e)=>{timer.Stop();if(job!=null){job.Dispose();job=null;}};
      FormClosing+=(s,e)=>{if(process!=null&&!process.HasExited){e.Cancel=true;if(closing)return;closing=true;status.Text="Stopping seep and local AI...";status.BringToFront();try{process.StandardInput.WriteLine("stop");process.StandardInput.Flush();}catch{}timer.Start();}else{view.Dispose();if(job!=null){job.Dispose();job=null;}}};
    }
    void UI(Action action){try{if(!IsDisposed)BeginInvoke(action);}catch{}}
    async Task Open(string url){
      try {
        var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(root,"runtime","webview-profile"));
        await view.EnsureCoreWebView2Async(environment);
        view.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
        view.CoreWebView2.Settings.IsStatusBarEnabled=false;
        view.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;if(e.Uri.StartsWith("https://"))Process.Start(new ProcessStartInfo(e.Uri){UseShellExecute=true});};
        view.CoreWebView2.NavigationStarting+=(s,e)=>{if(!e.Uri.StartsWith("http://127.0.0.1:11437/")){e.Cancel=true;if(e.Uri.StartsWith("https://"))Process.Start(new ProcessStartInfo(e.Uri){UseShellExecute=true});}};
        view.CoreWebView2.NavigationCompleted+=async(s,e)=>{
          if(!e.IsSuccess){status.Text="Dashboard could not load: "+e.WebErrorStatus;status.BringToFront();return;}
          view.Visible=true;view.BringToFront();
          if(autoStart){await Task.Delay(1200);await view.CoreWebView2.ExecuteScriptAsync("document.getElementById('start').click()");}
          if(capture!=null){await Task.Delay(16000);string script=Path.ChangeExtension(capture,".js");if(File.Exists(script)){await view.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(script));await Task.Delay(10000);}using(var file=File.Create(capture))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);File.WriteAllText(capture+".json",await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({title:document.title,body:document.body.innerText,errors:window.seepErrors||[],qa:window.seepQA||null})"));}
        };
        view.CoreWebView2.Navigate(url);
      }catch(Exception e){status.Text="Could not open desktop dashboard: "+e.Message+"\nInstall Microsoft Edge WebView2 Runtime if it is missing.";status.BringToFront();}
    }
    string Node(){string portable=Path.Combine(root,"runtime","node","node.exe");if(File.Exists(portable))return portable;string cached=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),@".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe");if(File.Exists(cached))return cached;return "node.exe";}
    void Start(){try{job=new ProcessJob();process=new Process{StartInfo=new ProcessStartInfo(Node(),"--env-file-if-exists=.env src/dashboard-server.js --panel-mode"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true},EnableRaisingEvents=true};
      process.OutputDataReceived+=(s,e)=>{if(e.Data!=null&&e.Data.StartsWith("@@DASHBOARD "))UI(async()=>await Open(e.Data.Substring(12)));};
      process.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)UI(()=>status.Text=e.Data);};process.Exited+=(s,e)=>UI(()=>{timer.Stop();if(job!=null){job.Dispose();job=null;}closing=true;Close();});
      process.Start();job.Add(process);process.BeginOutputReadLine();process.BeginErrorReadLine();
    }catch(Exception e){status.Text=e.Message;if(job!=null){job.Dispose();job=null;}}}
  }
}

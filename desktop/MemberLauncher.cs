using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
namespace SeepMemberDesktop {
  sealed class MemberWindow : Form {
    readonly WebView2 view=new WebView2();readonly Label status=new Label();
    public MemberWindow(){Text="seep member dashboard";ClientSize=new Size(1280,850);MinimumSize=new Size(1000,700);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.Black;
      status.Dock=DockStyle.Fill;status.TextAlign=ContentAlignment.MiddleCenter;status.ForeColor=Color.White;status.Text="Connecting to seep…";Controls.Add(status);view.Dock=DockStyle.Fill;view.DefaultBackgroundColor=Color.Black;view.Visible=false;Controls.Add(view);
      Shown+=async(s,e)=>{try {
        string path=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"member-server-url.txt"),url=File.Exists(path)?File.ReadAllText(path).Trim():"http://127.0.0.1:11438/";
        Uri target=new Uri(url);if(target.Scheme!="https"&&!(target.Scheme=="http"&&target.IsLoopback))throw new Exception("Use an HTTPS server URL or localhost.");
        string origin=target.GetLeftPart(UriPartial.Authority);
        var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"seep","member-webview"));
        await view.EnsureCoreWebView2Async(environment);view.CoreWebView2.Settings.IsStatusBarEnabled=false;
        view.CoreWebView2.NewWindowRequested+=(sender,args)=>{args.Handled=true;if(args.Uri.StartsWith("https://"))Process.Start(new ProcessStartInfo(args.Uri){UseShellExecute=true});};
        view.CoreWebView2.NavigationStarting+=(sender,args)=>{if(new Uri(args.Uri).GetLeftPart(UriPartial.Authority)!=origin){args.Cancel=true;if(args.Uri.StartsWith("https://"))Process.Start(new ProcessStartInfo(args.Uri){UseShellExecute=true});}};
        view.CoreWebView2.WebMessageReceived+=(sender,args)=>{if(new Uri(args.Source).GetLeftPart(UriPartial.Authority)!=origin)return;string login=args.TryGetWebMessageAsString();if(login.StartsWith(origin+"/auth/login?pair="))Process.Start(new ProcessStartInfo(login){UseShellExecute=true});};
        view.CoreWebView2.NavigationCompleted+=(sender,args)=>{if(args.IsSuccess){view.Visible=true;view.BringToFront();}else{status.Text="The seep host is unavailable. Ask the owner to start seep dashboard.\nClose and reopen this window to retry.";status.BringToFront();}};
        view.CoreWebView2.Navigate(origin+"/");
      }catch(Exception error){status.Text=error.Message;status.BringToFront();}};
      FormClosed+=(s,e)=>view.Dispose();
    }
  }
  static class MemberProgram {[STAThread]static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new MemberWindow());}}
}

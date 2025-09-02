
class AccountSearch{
	constructor(){
		this.result_display = document.getElementById('resultDisplay');
		this.form = document.getElementById('account_search_form');
		this.loadingDiv = document.querySelector(".loading-modal");	

		this.submitForm();
	}
	submitForm(){
		this.form.addEventListener('submit', async(e) => {
			e.preventDefault();

			try{
				const url = this.form.querySelector('select[name="county"]').value;
				const formData = {
					fetch_type: "html",
					type: "account",
					name: "",
					address: "",
					account: this.form.querySelector('input[name="accountNumber"]').value
				};
				// console.log(formData);

				if(url == "" || formData.account == ""){
					alert("Something went wrong, Please contact Admin");
					return;
				}

				this.loading();
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(formData)
				});
				const result = await response.text();
				this.result_display.innerHTML = result;
			
			}
			catch(error){
				console.log(error);
			}
			finally{
				this.loading_hide();
			}
		});
	}
	loading(){
		this.loadingDiv.classList.remove('loading-modal-hide');
	}
	loading_hide(){
		this.loadingDiv.classList.add('loading-modal-hide');
	}
}

new AccountSearch();
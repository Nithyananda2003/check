
class Orange{
	constructor(){
		this.form = document.getElementById('orderform');
		this.parcel_input = this.form.querySelector('input[name="parcel_number"]');

		this.loadingDiv = document.querySelector(".loading-modal");	
		this.tableDisplay = document.querySelector('#tabledata');

		this.submit_form();
	}
	submit_form(){

		this.form.addEventListener('submit', async (e) => {
			try{
				e.preventDefault();			
				const parcel_number = this.parcel_input.value;
				this.loading();
				if(parcel_number != ""){
					const formData = {
						name: "",
						address: "",
						account: parcel_number
					};
					const response = await fetch('/tax/FL/orange', {
						method: "POST",
						headers: {
							"Content-Type": "application/json"
						},
						body: JSON.stringify(formData)
					});
					const result = await response.json();

					console.log(result);
					this.tableDisplay.innerHTML = JSON.stringify(result);
				}			
			}
			catch(error){
				console.log(error);
				alert(error);
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

new Orange();